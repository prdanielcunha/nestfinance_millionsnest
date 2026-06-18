import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as dotenv from 'dotenv';
import { createHash } from 'crypto';
dotenv.config();

const app = getApps().length === 0 ? initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  })
}) : getApps()[0];

const firestore = getFirestore(app);
const auth = getAuth(app);

async function run() {
  try {
    const email = 'pastordanielpcunha@gmail.com';
    const user = await auth.getUserByEmail(email);
    console.log('User UID:', user.uid);
    
    const handoffSnap = await firestore.collection('ecosystemHandoffs')
      .where('uid', '==', user.uid)
      .get();
      
    if (handoffSnap.empty) {
      console.log('No consumed handoff found');
      return;
    }
    
    // Pick the most recent one manually in memory
    const handoffs = handoffSnap.docs.map(d => d.data()).filter(h => h.status === 'consumed' && h.appId === 'nestfinance');
    handoffs.sort((a, b) => b.consumedAt.toMillis() - a.consumedAt.toMillis());
    const orgId = handoffs[0].organizationId;
    console.log('Organization ID:', orgId);
    
    // Read organization
    const orgDoc = await firestore.collection('organizations').doc(orgId).get();
    console.log('Organization Name:', orgDoc.data()?.name);
    
    const catId = 'cat_e8397c1d8e9043ee';
    const catDoc = await firestore.collection('organizations').doc(orgId).collection('financeCategories').doc(catId).get();
    
    console.log('--- Edited Category ---');
    console.log(catDoc.data());
    
    console.log('--- Search by normalizedName ---');
    const searchSnap = await firestore.collection('organizations').doc(orgId).collection('financeCategories')
      .where('normalizedName', '==', 'agua (cadastro incorreto)')
      .where('kind', '==', 'income')
      .get();
    console.log('Found documents:', searchSnap.docs.length);
    searchSnap.docs.forEach(d => console.log('Doc ID:', d.id));
    
    console.log('--- Locks ---');
    // Using simple SHA-256 for locks
    const getLockId = (key: string) => {
      const digest = createHash('sha256').update(key).digest('hex');
      return `uniq_${digest.substring(0, 32)}`;
    };
    const lock1Logic = 'category:income:agua';
    const lock1Id = getLockId(lock1Logic);
    const lock2Logic = 'category:income:agua (cadastro incorreto)';
    const lock2Id = getLockId(lock2Logic);
    
    console.log('Lock 1 (agua):', lock1Id);
    const lock1Doc = await firestore.collection('organizations').doc(orgId).collection('financeUniqueKeys').doc(lock1Id).get();
    console.log('Lock 1 exists:', lock1Doc.exists, lock1Doc.data());
    
    console.log('Lock 2 (agua cadastro incorreto):', lock2Id);
    const lock2Doc = await firestore.collection('organizations').doc(orgId).collection('financeUniqueKeys').doc(lock2Id).get();
    console.log('Lock 2 exists:', lock2Doc.exists, lock2Doc.data());
    
    console.log('--- Audit Log ---');
    const auditSnap = await firestore.collection('organizations').doc(orgId).collection('financeAuditLogs')
      .where('action', '==', 'finance.category.updated')
      .where('entityType', '==', 'financeCategory')
      .where('entityId', '==', catId)
      .where('actorUid', '==', user.uid)
      .get();
      
    console.log('Audit Logs found:', auditSnap.docs.length);
    auditSnap.docs.forEach(d => console.log(`Audit ID: ${d.id}`, d.data()));
    
    console.log('--- Água Saida ---');
    const aguaSaidaId = 'cat_559788b1d2e9dfa7';
    const aguaSaidaDoc = await firestore.collection('organizations').doc(orgId).collection('financeCategories').doc(aguaSaidaId).get();
    console.log(aguaSaidaDoc.data());
    
    console.log('--- Contagens ---');
    const allCats = await firestore.collection('organizations').doc(orgId).collection('financeCategories').get();
    let total = allCats.docs.length;
    let active = 0;
    let archived = 0;
    let incomeAct = 0;
    let incomeArch = 0;
    let expAct = 0;
    let expArch = 0;
    
    allCats.docs.forEach(d => {
      const data = d.data();
      if (data.active) active++;
      else archived++;
      
      if (data.kind === 'income' && data.active) incomeAct++;
      if (data.kind === 'income' && !data.active) incomeArch++;
      if (data.kind === 'expense' && data.active) expAct++;
      if (data.kind === 'expense' && !data.active) expArch++;
    });
    
    console.log(`Total: ${total}, Active: ${active}, Archived: ${archived}`);
    console.log(`Income Active: ${incomeAct}, Income Arch: ${incomeArch}`);
    console.log(`Expense Active: ${expAct}, Expense Arch: ${expArch}`);
    
    console.log('--- Efeitos Colaterais ---');
    
  } catch (err) {
    console.error(err);
  }
}
run();
