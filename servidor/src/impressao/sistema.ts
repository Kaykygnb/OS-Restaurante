import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { imprimirRede } from "./rede.js";

const execFileAsync = promisify(execFile);

export type ImpressoraSistema = {
  nome: string;
  status?: string | null;
  porta?: string | null;
  padrao?: boolean;
};

function parseJsonLista(stdout: string): unknown {
  const txt = stdout.trim();
  if (!txt) return [];
  return JSON.parse(txt);
}

async function listarWindows(): Promise<ImpressoraSistema[]> {
  const script = [
    "$def = $null",
    "try { $def = (Get-CimInstance -ClassName Win32_Printer -Filter 'Default=True' -ErrorAction SilentlyContinue).Name } catch {}",
    "Get-Printer | Select-Object Name, PrinterStatus, PortName, @{N='Default';E={ $_.Name -eq $def }} | ConvertTo-Json -Compress",
  ].join("; ");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024 }
  );

  const raw = parseJsonLista(stdout);
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return arr
    .map((item: any) => ({
      nome: String(item?.Name ?? "").trim(),
      status: item?.PrinterStatus != null ? String(item.PrinterStatus) : null,
      porta: item?.PortName != null ? String(item.PortName) : null,
      padrao: Boolean(item?.Default),
    }))
    .filter((p) => p.nome.length > 0)
    .sort((a, b) => Number(b.padrao) - Number(a.padrao) || a.nome.localeCompare(b.nome, "pt-BR"));
}

async function listarCups(): Promise<ImpressoraSistema[]> {
  try {
    const { stdout } = await execFileAsync("lpstat", ["-a"], {
      timeout: 8000,
      maxBuffer: 1024 * 1024,
    });
    return stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const nome = l.split(/\s+/)[0] ?? "";
        return { nome, status: null, porta: null, padrao: false };
      })
      .filter((p) => p.nome.length > 0);
  } catch {
    return [];
  }
}

export async function listarImpressorasSistema(): Promise<ImpressoraSistema[]> {
  const plataforma = process.platform;
  try {
    if (plataforma === "win32") return await listarWindows();
    if (plataforma === "linux" || plataforma === "darwin") return await listarCups();
    return [];
  } catch (err) {
    console.error("[impressao-sistema] falha ao listar:", err);
    return [];
  }
}

/** Envia bytes RAW para a fila do SO (sem driver de formatação). */
export async function imprimirSistema(nomeSistema: string, dados: Buffer): Promise<void> {
  const nome = nomeSistema.trim();
  if (!nome) throw new Error("Nome da impressora do sistema vazio");

  if (process.platform === "win32") {
    await imprimirWindowsRaw(nome, dados);
    return;
  }
  if (process.platform === "linux" || process.platform === "darwin") {
    await imprimirCupsRaw(nome, dados);
    return;
  }
  throw new Error("Impressão via sistema não suportada neste sistema operacional");
}

/** Portas tipo "192.168.0.10:9100" ou "IP_192.168.0.10_9100" → TCP direto. */
function parsePortaTcp(porta: string | null | undefined): { ip: string; porta: number } | null {
  if (!porta) return null;
  const m = porta.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);
  if (m) return { ip: m[1]!, porta: Number(m[2]) };
  return null;
}

async function obterPortaWindows(nome: string): Promise<string | null> {
  const script = `$p = Get-Printer -Name ${JSON.stringify(nome)} -ErrorAction Stop; $p.PortName`;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 10000 }
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function imprimirWindowsRaw(nome: string, dados: Buffer): Promise<void> {
  // 1) Se a fila aponta pra TCP (ex: 127.0.0.1:9100), manda RAW direto — mais confiável pra ESC/POS
  const portaNome = await obterPortaWindows(nome);
  const tcp = parsePortaTcp(portaNome);
  if (tcp) {
    await imprimirRede(tcp.ip, tcp.porta, dados);
    return;
  }

  // 2) winspool WritePrinter (não exige compartilhar a impressora)
  const tmp = path.join(os.tmpdir(), `os-rest-escpos-${Date.now()}-${process.pid}.bin`);
  await fs.writeFile(tmp, dados);

  const ps = `
$ErrorActionPreference = 'Stop'
$printerName = ${JSON.stringify(nome)}
$filePath = ${JSON.stringify(tmp)}
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static void SendBytes(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) throw new Exception("OpenPrinter falhou (Win32=" + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFOA di = new DOCINFOA();
      di.pDocName = "OS-Restaurante ESC/POS";
      di.pDataType = "RAW";
      if (!StartDocPrinter(hPrinter, 1, di)) throw new Exception("StartDocPrinter falhou (Win32=" + Marshal.GetLastWin32Error() + ")");
      try {
        if (!StartPagePrinter(hPrinter)) throw new Exception("StartPagePrinter falhou (Win32=" + Marshal.GetLastWin32Error() + ")");
        try {
          IntPtr p = Marshal.AllocHGlobal(bytes.Length);
          try {
            Marshal.Copy(bytes, 0, p, bytes.Length);
            int written;
            if (!WritePrinter(hPrinter, p, bytes.Length, out written)) throw new Exception("WritePrinter falhou (Win32=" + Marshal.GetLastWin32Error() + ")");
          } finally { Marshal.FreeHGlobal(p); }
        } finally { EndPagePrinter(hPrinter); }
      } finally { EndDocPrinter(hPrinter); }
    } finally { ClosePrinter(hPrinter); }
  }
}
"@
$bytes = [System.IO.File]::ReadAllBytes($filePath)
[RawPrinterHelper]::SendBytes($printerName, $bytes)
`;

  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 }
    );
  } catch (err: any) {
    const detail = [err?.stderr, err?.stdout, err?.message].filter(Boolean).join(" | ");
    throw new Error(
      `Falha ao enviar RAW para impressora do Windows "${nome}" (porta: ${portaNome ?? "?"}): ${detail}`
    );
  } finally {
    await fs.unlink(tmp).catch(() => null);
  }
}

async function imprimirCupsRaw(nome: string, dados: Buffer): Promise<void> {
  const tmp = path.join(os.tmpdir(), `os-rest-escpos-${Date.now()}-${process.pid}.bin`);
  await fs.writeFile(tmp, dados);
  try {
    await execFileAsync("lp", ["-d", nome, "-o", "raw", tmp], {
      timeout: 20000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Falha ao enviar RAW via CUPS "${nome}": ${msg}`);
  } finally {
    await fs.unlink(tmp).catch(() => null);
  }
}
