import pc from 'picocolors';

/**
 * Console logging utilities with clean styling for CLI and REPL interfaces.
 */
const tomatoColor = (msg: string) => `\x1b[38;2;255;99;71m${msg}\x1b[39m`;

export const logger = {
  info: (msg: string) => console.log(`${pc.cyan('ℹ')} ${msg}`),
  success: (msg: string) => console.log(`${pc.green('✔')} ${msg}`),
  warn: (msg: string) => console.log(`${pc.yellow('⚠')} ${msg}`),
  error: (msg: string) => console.error(`${pc.red('✖')} ${msg}`),
  debug: (msg: string) => {
    if (process.env.DEBUG || process.env.DASYU_DEBUG) {
      console.log(`${pc.dim('⚙')} ${pc.dim(msg)}`);
    }
  },
  header: (msg: string) => console.log(`\n${pc.bold(tomatoColor('⚔  ' + msg))}`),
  dim: (msg: string) => pc.dim(msg),
  bold: (msg: string) => pc.bold(msg),
  green: (msg: string) => pc.green(msg),
  cyan: (msg: string) => pc.cyan(msg),
  yellow: (msg: string) => pc.yellow(msg),
  red: (msg: string) => pc.red(msg),
  tomato: (msg: string) => tomatoColor(msg),
};
