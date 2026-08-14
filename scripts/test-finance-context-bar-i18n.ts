import * as fs from 'fs';
import * as path from 'path';

const sourcePath = path.resolve('src/components/finance/FinanceEntityContextBar.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

let passed = 0;
let failed = 0;

function verify(name: string, condition: boolean) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
    return;
  }

  console.error(`❌ ${name}`);
  failed++;
}

console.log('Running finance context bar localization checks...');

verify('uses translated current-church label', source.includes("t('select_entity_current_church')"));
verify('uses translated switch label', source.includes("t('select_entity_switch_btn')"));
verify('uses translated selector title', source.includes("t('select_entity_modal_title')"));
verify('uses translated cancel label', source.includes("t('select_entity_cancel')"));
verify('does not hardcode selector title in the component', !source.includes('>Selecionar igreja<'));
verify('does not hardcode cancel action in the component', !source.includes('>Cancelar<'));
verify('provides PT switch aria copy', source.includes('PT: (entityName)'));
verify('provides EN switch aria copy', source.includes('EN: (entityName)'));
verify('provides ES switch aria copy', source.includes('ES: (entityName)'));
verify('selector exposes dialog semantics', source.includes('role="dialog"') && source.includes('aria-modal="true"'));
verify('selector title is associated to dialog', source.includes('aria-labelledby={selectorTitleId}') && source.includes('id={selectorTitleId}'));
verify('entity switching contract remains present', source.includes('setActiveFinanceEntityId(other.id, other.displayName)'));
verify('bootstrap readiness lookup remains present', source.includes("/api/finance/entities/bootstrap/status"));

console.log(`\nFinance context bar totals: ${passed} Passed, ${failed} Failed`);
process.exit(failed > 0 ? 1 : 0);
