// A minimal in-memory Fake Firestore
export class FakeFirestore {
  data: Record<string, any> = {};

  collection(path: string): any {
    return new FakeCollection(this, path);
  }

  runTransaction(updateFunction: (transaction: any) => Promise<any>) {
    // simplified mock transaction
    const t = new FakeTransaction(this);
    return updateFunction(t);
  }
}

class FakeCollection {
  constructor(private db: FakeFirestore, private path: string) {}

  doc(id?: string): any {
    const docId = id || Math.random().toString(36).substring(2);
    return new FakeDoc(this.db, this.path + '/' + docId);
  }

  where(field: string, op: string, value: any): any {
    // Return self for chaining, in real it filters
    const query = new FakeQuery(this.db, this.path, [{ field, op, value }]);
    return query;
  }

  async get() {
    return new FakeQuery(this.db, this.path, []).get();
  }
}

class FakeDoc {
  constructor(private db: FakeFirestore, private path: string) {}

  get id() {
    return this.path.split('/').pop();
  }

  async get() {
    const data = this.db.data[this.path];
    return {
      exists: data !== undefined,
      id: this.id,
      data: () => data,
      ref: this
    };
  }

  async set(data: any, options?: any) {
    if (options?.merge && this.db.data[this.path]) {
      this.db.data[this.path] = { ...this.db.data[this.path], ...data };
    } else {
      this.db.data[this.path] = data;
    }
  }

  async update(data: any) {
    if (!this.db.data[this.path]) throw new Error('NOT_FOUND');
    this.db.data[this.path] = { ...this.db.data[this.path], ...data };
  }

  async delete() {
    delete this.db.data[this.path];
  }

  collection(path: string) {
    return new FakeCollection(this.db, this.path + '/' + path);
  }
}

class FakeQuery {
  constructor(private db: FakeFirestore, private path: string, private filters: any[]) {}

  where(field: string, op: string, value: any) {
    this.filters.push({ field, op, value });
    return this;
  }

  orderBy() { return this; }
  limit() { return this; }
  startAfter() { return this; }

  async get() {
    // Search in db.data
    // path is something like organizations/123/financeTransactions
    const results = [];
    for (const key of Object.keys(this.db.data)) {
      if (key.startsWith(this.path + '/')) {
        const parts = key.slice(this.path.length + 1).split('/');
        if (parts.length === 1) { // direct children
          const data = this.db.data[key];
          let match = true;
          for (const f of this.filters) {
            let val = data;
            if (f.field.includes('.')) {
              const parts = f.field.split('.');
              val = data[parts[0]] ? data[parts[0]][parts[1]] : undefined;
            } else {
              val = data[f.field];
            }
            if (val === undefined) {
              match = false;
            } else {
              if (f.op === '==' && val !== f.value) match = false;
              if (f.op === '>=' && val < f.value) match = false;
              if (f.op === '<=' && val > f.value) match = false;
              if (f.op === '>' && val <= f.value) match = false;
              if (f.op === '<' && val >= f.value) match = false;
              if (f.op === 'in' && Array.isArray(f.value) && !f.value.includes(val)) match = false;
            }
          }
          if (match) {
            results.push({ id: parts[0], data: () => data, exists: true, ref: new FakeDoc(this.db, key) });
          }
        }
      }
    }
    return { 
      docs: results, 
      empty: results.length === 0,
      forEach(cb: (doc: any) => void) {
        results.forEach(cb);
      }
    };
  }
}

class FakeTransaction {
  constructor(private db: FakeFirestore) {}

  async get(queryOrRef: any) {
    return queryOrRef.get();
  }

  set(ref: any, data: any, options?: any) {
    // mock FieldValue
    const d = { ...data };
    for (const key in d) {
       if (d[key] && typeof d[key] === 'object' && d[key].isEqual) {
           d[key] = new Date().toISOString(); // Mock timestamp
       }
    }
    ref.set(d, options);
    return this;
  }

  update(ref: any, data: any) {
     const d = { ...data };
    for (const key in d) {
       if (d[key] && typeof d[key] === 'object' && d[key].isEqual) {
           d[key] = new Date().toISOString(); // Mock timestamp
       }
    }
    ref.update(d);
    return this;
  }

  delete(ref: any) {
    ref.delete();
    return this;
  }
}
