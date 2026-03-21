// import { logger } from '../../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import vm from 'vm';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export type ExecutionResult = {
    output: string;
    error?: string;
    executionTime: number;
    success: boolean;
};

export class CodeExecutionService {

    /**
     * Execute code based on language
     */
    async execute(language: 'javascript' | 'python' | 'powershell', code: string): Promise<ExecutionResult> {
        const startTime = Date.now();

        try {
            switch (language) {
                case 'javascript':
                    return await this.executeJavascript(code, startTime);
                case 'python':
                    return await this.executePython(code, startTime);
                case 'powershell':
                    return await this.executePowershell(code, startTime);
                default:
                    throw new Error(`Unsupported language: ${language}`);
            }
        } catch (error) {
            return {
                output: '',
                error: (error as Error).message,
                executionTime: Date.now() - startTime,
                success: false
            };
        }
    }

    /**
     * Execute JavaScript securely-ish using Node.js VM
     */
    private async executeJavascript(code: string, startTime: number): Promise<ExecutionResult> {
        try {
            const context = vm.createContext({
                console: {
                    log: (..._args: any[]) => {
                        // Capture log output
                        // In a real implementation we would buffer this
                    }
                },
                // Add safe globals here
            });

            // Capture console.log
            let logs: string[] = [];
            context.console.log = (...args: any[]) => {
                logs.push(args.map(a => String(a)).join(' '));
            };

            const script = new vm.Script(code);
            const result = script.runInContext(context, { timeout: 5000 }); // 5s timeout

            const output = logs.join('\n') + (result !== undefined ? `\nReturn: ${String(result)}` : '');

            return {
                output: output.trim(),
                executionTime: Date.now() - startTime,
                success: true
            };
        } catch (error) {
            return {
                output: '',
                error: (error as Error).message,
                executionTime: Date.now() - startTime,
                success: false
            };
        }
    }

    /**
     * Execute Python using local interpreter
     */
    private async executePython(code: string, startTime: number): Promise<ExecutionResult> {
        // Write to temp file
        const tempPath = path.join(__dirname, `../../temp_${Date.now()}.py`);

        try {
            fs.writeFileSync(tempPath, code);
            const { stdout, stderr } = await execAsync(`python "${tempPath}"`, { timeout: 10000 });

            return {
                output: stdout,
                error: stderr,
                executionTime: Date.now() - startTime,
                success: !stderr // Python might write warnings to stderr but still succeed? 
            };
        } catch (error) {
            return {
                output: '',
                error: (error as any).message,
                executionTime: Date.now() - startTime,
                success: false
            };
        } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
    }

    /**
     * Execute PowerShell for Automation
     */
    private async executePowershell(code: string, startTime: number): Promise<ExecutionResult> {
        // Security Warning: this is dangerous. Use with caution.
        try {
            const { stdout, stderr } = await execAsync(`powershell -Command "${code.replace(/"/g, '\\"')}"`, { timeout: 15000 });

            return {
                output: stdout,
                error: stderr,
                executionTime: Date.now() - startTime,
                success: !stderr
            };
        } catch (error) {
            return {
                output: '',
                error: (error as any).message,
                executionTime: Date.now() - startTime,
                success: false
            };
        }
    }
}

export const codeExecutionService = new CodeExecutionService();
