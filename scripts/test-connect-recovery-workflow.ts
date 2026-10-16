import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
function scenario(enabled: boolean, split = false, plaintext = false) {
  const dir = mkdtempSync(join(tmpdir(), 'finance-recovery-synthetic-'));
  try {
    const env = [
      { name: 'FIREBASE_PROJECT_ID', value: 'millionsnest' },
      { name: 'NESTFINANCE_CONNECT_PENDING_EVENTS_ENABLED', value: String(enabled) },
      { name: 'NESTFINANCE_CONNECT_SOURCE_EVENT_SECRET', ...(plaintext ? {value:'synthetic-only'} :
        {valueFrom:{secretKeyRef:{name:'synthetic-source',key:'1'}}}) },
      { name: 'NESTFINANCE_CONNECT_OPERATOR_TARGETS_JSON', value:'{}' },
      { name: 'STRIPE_SECRET_KEY', value:'synthetic-unrelated' },
    ];
    writeFileSync(join(dir,'service.json'),JSON.stringify({spec:{template:{spec:{containers:[{env}]}}},
      status:{traffic:split?[{percent:50,revisionName:'synthetic-a'},{percent:50,revisionName:'synthetic-b'}]:
        [{percent:100,revisionName:'synthetic-a'}]}}));
    writeFileSync(join(dir,'revision.json'),JSON.stringify({spec:{containers:[{env}],
      serviceAccountName:'mn-nestfinance-runtime@millionsnest.iam.gserviceaccount.com'},status:{
      conditions:[{type:'Ready',status:'True'}],
      imageDigest:'us-central1-docker.pkg.dev/millionsnest/millionsnest-web/nestfinance-api@sha256:'+'a'.repeat(64)}}));
    writeFileSync(join(dir,'gcloud'),`#!/bin/bash
set -euo pipefail
echo "$*" >> "$FIXTURE_DIR/calls"
if [[ "$*" == 'run services describe '* ]]; then cat "$FIXTURE_DIR/service.json"
elif [[ "$*" == 'run revisions describe '* ]]; then cat "$FIXTURE_DIR/revision.json"
elif [[ "$*" == 'run jobs replace '* ]]; then cp "$4" "$FIXTURE_DIR/job.json"
elif [[ "$*" != 'run jobs execute '* ]]; then exit 90
fi
`,{mode:0o700});
    const result=spawnSync('bash',[resolve('scripts/run-connect-source-recovery.sh')],{encoding:'utf8',env:{
      ...process.env,PATH:dir+':'+process.env.PATH,FIXTURE_DIR:dir,GITHUB_REF:'refs/heads/production',
      GITHUB_REPOSITORY:'prdanielcunha/nestfinance_millionsnest'}});
    if (!enabled) {
      assert.equal(result.status,0,result.stderr);
      assert.match(result.stdout,/DISABLED_NO_MUTATION/);
      assert.equal(readFileSync(join(dir,'calls'),'utf8').trim().split('\n').length,1);
      assert(!existsSync(join(dir,'job.json')));
    } else if (split||plaintext) {
      assert.notEqual(result.status,0); assert(!existsSync(join(dir,'job.json')));
    } else {
      assert.equal(result.status,0,result.stderr);
      const task=JSON.parse(readFileSync(join(dir,'job.json'),'utf8')).spec.template.spec.template.spec;
      assert.equal(task.maxRetries,0);
      assert.equal(task.serviceAccountName,'mn-nestfinance-runtime@millionsnest.iam.gserviceaccount.com');
      assert.deepEqual(task.containers[0].args,['server-dist/connect-recovery.mjs']);
      assert(!JSON.stringify(task).includes('STRIPE_SECRET_KEY'));
      assert.match(task.containers[0].image,/@sha256:/);
      assert(!/add-iam|secrets|services update|deploy/.test(readFileSync(join(dir,'calls'),'utf8')));
    }
  } finally { rmSync(dir,{recursive:true,force:true}); }
}
scenario(false);scenario(true,true);scenario(true,false,true);scenario(true);
console.log('Finance protected job simulator PASS: OFF no-op, traffic/key guards, source-only secrets, immutable image, IAM unchanged. No real GCP execution claimed.');
