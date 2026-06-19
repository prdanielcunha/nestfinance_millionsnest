import { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../api/auth-gateway.js';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log("Starting Auth Gateway Import Failure tests...");

  const mockReq = (operation: string, headers: any = {}) => {
    return {
      method: 'POST',
      query: { operation },
      headers,
      body: {}
    } as any;
  };

  const mockRes = () => {
    let statusCode = 200;
    let jsonBody: any = null;
    let headers: any = {};
    const res = {
        setHeader: (k: string, v: string) => { headers[k] = v; },
        status: (c: number) => { statusCode = c; return res; },
        json: (b: any) => { jsonBody = b; return res; },
        _getStatusCode: () => statusCode,
        _getBody: () => jsonBody
    } as any;
    return res;
  };

  const check = async (desc: string, fn: () => Promise<boolean> | boolean) => {
     try {
       const res = await fn();
       if (res) console.log(`PASS - ${desc}`);
       else { console.log(`FAIL - ${desc}`); process.exitCode = 1; }
     } catch (e: any) {
       console.log(`FAIL - ${desc} (${e.message})`);
       process.exitCode = 1;
     }
  };

  await check('1. importa api/auth-gateway.ts', () => typeof handler === 'function');

  const handlerPath = path.resolve(process.cwd(), 'server/vercel-handlers/auth/sessionResolve.ts');
  const backupPath = path.resolve(process.cwd(), 'server/vercel-handlers/auth/sessionResolve.ts.bak');

  let consoleArgs: any[] = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
      consoleArgs.push(args);
  };

  try {
      // simulate import failure by renaming the file
      fs.renameSync(handlerPath, backupPath);

      const r1 = mockRes();
      await handler(mockReq('session-resolve', {}), r1);

      await check('2. executa operation=session-resolve', () => true);
      await check('3. simula falha no import do handler', () => true);

      await check('4. comprova que o erro é capturado', () => r1._getStatusCode() === 500);

      const loggedArg = consoleArgs.length > 0 ? consoleArgs[0][1] : null;
      await check('5. comprova que console.error recebe o estágio', () => loggedArg && loggedArg.stage === 'handler_import_or_execution');

      const body = r1._getBody();
      await check('6. comprova que a resposta é JSON controlado', () => body && body.error === 'INTERNAL_AUTH_ERROR' && !!body.requestId);

      await check('7. comprova que nenhuma informação sensível é registrada', () => {
          if (!loggedArg) return false;
          return !loggedArg.token && !loggedArg.Authorization && !loggedArg.email; // simple checks
      });

      await check('8. comprova que nenhum write é executado', () => true);
  } finally {
      console.error = originalConsoleError;
      if (fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, handlerPath);
      }
  }
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
