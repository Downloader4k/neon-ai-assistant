import { exec } from 'child_process';
import { promisify } from 'util';
import vm from 'vm';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { logger } from '../../utils/logger';

const execAsync = promisify(exec);

export type ExecutionResult = {
    output: string;
    error?: string;
    executionTime: number;
    success: boolean;
};

// Gefaehrliche Muster die blockiert werden
const BLOCKED_JS_PATTERNS = [
    /require\s*\(/,          // Node.js Module laden
    /import\s+/,             // ES Module Import
    /process\./,             // Process-Zugriff
    /child_process/,         // Kindprozesse starten
    /\bexec\b/,              // Shell-Ausfuehrung
    /\beval\b/,              // Eval-Ketten
    /Function\s*\(/,         // Dynamische Funktionen
    /fs\./,                  // Dateisystem
    /net\./,                 // Netzwerk
    /http\./,                // HTTP
    /Buffer\./,              // Buffer-Zugriff
    /__dirname/,             // Verzeichnis-Info
    /__filename/,            // Datei-Info
    /globalThis/,            // Global-Zugriff
];

const BLOCKED_PYTHON_PATTERNS = [
    /import\s+os\b/,         // OS-Modul
    /import\s+subprocess/,   // Subprozesse
    /import\s+shutil/,       // Dateisystem-Ops
    /import\s+socket/,       // Netzwerk
    /import\s+http/,         // HTTP
    /import\s+urllib/,       // URL-Zugriff
    /import\s+requests/,     // HTTP Requests
    /from\s+pathlib/,        // Pfad-Manipulation
    /open\s*\(.*(\/|\\)/,    // Dateizugriff mit Pfaden
    /exec\s*\(/,             // Dynamisches Exec
    /eval\s*\(/,             // Eval
    /__import__/,            // Dynamischer Import
];

const BLOCKED_PS_PATTERNS = [
    /Remove-Item/i,          // Dateien loeschen
    /Set-ExecutionPolicy/i,  // Policy aendern
    /Invoke-WebRequest/i,    // Web-Downloads
    /Invoke-RestMethod/i,    // REST-Aufrufe
    /Start-Process/i,        // Prozesse starten
    /New-Object\s+.*Net\./i, // .NET Netzwerk
    /\[System\.IO/i,         // IO-Operationen
    /reg\s+(add|delete)/i,   // Registry aendern
    /Stop-Service/i,         // Dienste stoppen
    /Stop-Computer/i,        // PC herunterfahren
    /Restart-Computer/i,     // PC neustarten
    /Format-Volume/i,        // Volumen formatieren
];

export class CodeExecutionService {

    /**
     * Code ausfuehren (mit Sicherheitspruefung)
     */
    async execute(language: 'javascript' | 'python' | 'powershell', code: string): Promise<ExecutionResult> {
        const startTime = Date.now();

        // Sicherheitspruefung
        const securityCheck = this.validateCode(language, code);
        if (!securityCheck.safe) {
            logger.warn('Code-Ausfuehrung blockiert', { language, reason: securityCheck.reason });
            return {
                output: '',
                error: `Sicherheitswarnung: ${securityCheck.reason}`,
                executionTime: Date.now() - startTime,
                success: false,
            };
        }

        try {
            switch (language) {
                case 'javascript':
                    return await this.executeJavascript(code, startTime);
                case 'python':
                    return await this.executePython(code, startTime);
                case 'powershell':
                    return await this.executePowershell(code, startTime);
                default:
                    throw new Error(`Nicht unterstuetzte Sprache: ${language}`);
            }
        } catch (error) {
            return {
                output: '',
                error: (error as Error).message,
                executionTime: Date.now() - startTime,
                success: false,
            };
        }
    }

    /**
     * Code auf gefaehrliche Muster pruefen
     */
    private validateCode(language: string, code: string): { safe: boolean; reason?: string } {
        let patterns: RegExp[] = [];

        switch (language) {
            case 'javascript':
                patterns = BLOCKED_JS_PATTERNS;
                break;
            case 'python':
                patterns = BLOCKED_PYTHON_PATTERNS;
                break;
            case 'powershell':
                patterns = BLOCKED_PS_PATTERNS;
                break;
        }

        for (const pattern of patterns) {
            if (pattern.test(code)) {
                return {
                    safe: false,
                    reason: `Blockiertes Muster erkannt: ${pattern.source}`,
                };
            }
        }

        // Maximale Code-Laenge pruefen (10KB)
        if (code.length > 10240) {
            return { safe: false, reason: 'Code zu lang (max. 10KB)' };
        }

        return { safe: true };
    }

    /**
     * JavaScript sicher ausfuehren via Node.js VM (Sandbox)
     */
    private async executeJavascript(code: string, startTime: number): Promise<ExecutionResult> {
        try {
            const logs: string[] = [];

            const context = vm.createContext({
                console: {
                    log: (...args: any[]) => logs.push(args.map(String).join(' ')),
                    error: (...args: any[]) => logs.push('[ERROR] ' + args.map(String).join(' ')),
                    warn: (...args: any[]) => logs.push('[WARN] ' + args.map(String).join(' ')),
                    info: (...args: any[]) => logs.push('[INFO] ' + args.map(String).join(' ')),
                },
                Math,
                Date,
                JSON,
                parseInt,
                parseFloat,
                isNaN,
                isFinite,
                Array,
                Object,
                String,
                Number,
                Boolean,
                Map,
                Set,
                RegExp,
                Promise,
                setTimeout: undefined,
                setInterval: undefined,
            });

            const script = new vm.Script(code);
            const result = script.runInContext(context, { timeout: 5000 });

            const output = logs.join('\n') + (result !== undefined ? `\nReturn: ${String(result)}` : '');

            return {
                output: output.trim(),
                executionTime: Date.now() - startTime,
                success: true,
            };
        } catch (error) {
            return {
                output: '',
                error: (error as Error).message,
                executionTime: Date.now() - startTime,
                success: false,
            };
        }
    }

    /**
     * Python ausfuehren (Temp-Datei, Timeout)
     */
    private async executePython(code: string, startTime: number): Promise<ExecutionResult> {
        const tempDir = os.tmpdir();
        const tempPath = path.join(tempDir, `neon_exec_${Date.now()}.py`);

        try {
            fs.writeFileSync(tempPath, code);
            const { stdout, stderr } = await execAsync(`python "${tempPath}"`, {
                timeout: 10000,
                cwd: tempDir,
            });

            return {
                output: stdout,
                error: stderr || undefined,
                executionTime: Date.now() - startTime,
                success: !stderr,
            };
        } catch (error) {
            return {
                output: '',
                error: (error as any).message,
                executionTime: Date.now() - startTime,
                success: false,
            };
        } finally {
            try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        }
    }

    /**
     * PowerShell ausfuehren (eingeschraenkt)
     */
    private async executePowershell(code: string, startTime: number): Promise<ExecutionResult> {
        try {
            // Nur lesende Befehle mit -NoProfile fuer minimale Angriffsflaeche
            const safeCode = code.replace(/"/g, '\\"');
            const { stdout, stderr } = await execAsync(
                `powershell -NoProfile -NonInteractive -Command "${safeCode}"`,
                { timeout: 15000 }
            );

            return {
                output: stdout,
                error: stderr || undefined,
                executionTime: Date.now() - startTime,
                success: !stderr,
            };
        } catch (error) {
            return {
                output: '',
                error: (error as any).message,
                executionTime: Date.now() - startTime,
                success: false,
            };
        }
    }
}

export const codeExecutionService = new CodeExecutionService();
