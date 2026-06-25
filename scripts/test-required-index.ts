import fs from 'fs';
import path from 'path';

function runTest() {
  console.log('Testing firestore.indexes.json for required index...');
  
  const filePath = path.join(process.cwd(), 'firestore.indexes.json');
  if (!fs.existsSync(filePath)) {
    console.error('❌ firestore.indexes.json not found');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const indexes = data.indexes || [];

  const expectedIndex = {
    collectionGroup: "financeTransactions",
    queryScope: "COLLECTION",
    fields: [
      { fieldPath: "financeEntityId", order: "ASCENDING" },
      { fieldPath: "listQueryKeys.status", order: "DESCENDING" },
      { fieldPath: "__name__", order: "DESCENDING" }
    ]
  };

  const found = indexes.some((idx: any) => {
    if (idx.collectionGroup !== expectedIndex.collectionGroup) return false;
    if (idx.queryScope !== expectedIndex.queryScope) return false;
    if (!idx.fields || idx.fields.length !== expectedIndex.fields.length) return false;
    
    return expectedIndex.fields.every((expectedField: any, i: number) => {
      const actualField = idx.fields[i];
      return actualField.fieldPath === expectedField.fieldPath && actualField.order === expectedField.order;
    });
  });

  if (found) {
    console.log('✅ Required index is present in firestore.indexes.json');
    process.exit(0);
  } else {
    console.error('❌ Required index is NOT present in firestore.indexes.json or is incorrectly configured.');
    process.exit(1);
  }
}

runTest();
