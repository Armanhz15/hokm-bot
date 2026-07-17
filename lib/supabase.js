const { createClient } = require('@supabase/supabase-js');

let _supabase = null;

function getClient() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

function createDb() {
  const supabase = getClient();

  function buildQuery(tableObj) {
    let query = supabase.from(tableObj._name).select('*');
    const filters = [];
    let orderField = null;
    let orderAsc = true;

    const q = {
      where(field, value) {
        filters.push([field, value]);
        return q;
      },
      orderBy(field) {
        orderField = field;
        return q;
      },
      async first() {
        for (const [f, v] of filters) query = query.eq(f, v);
        if (orderField) query = query.order(orderField, { ascending: orderAsc });
        const { data } = await query.limit(1);
        return data && data.length > 0 ? data[0] : null;
      },
      async all() {
        for (const [f, v] of filters) query = query.eq(f, v);
        if (orderField) query = query.order(orderField, { ascending: orderAsc });
        const { data } = await query;
        return data || [];
      },
    };
    return q;
  }

  return {
    select(tableObj) {
      return buildQuery(tableObj);
    },
    async insert(tableObj, row) {
      const { data } = await supabase.from(tableObj._name).insert(row).select().single();
      return data;
    },
    update(tableObj) {
      const filters = [];
      return {
        where(field, value) {
          filters.push([field, value]);
          return this;
        },
        async set(values) {
          let query = supabase.from(tableObj._name).update(values).select();
          for (const [f, v] of filters) query = query.eq(f, v);
          const { data } = await query;
          return data;
        },
      };
    },
    delete(tableObj) {
      const filters = [];
      return {
        where(field, value) {
          filters.push([field, value]);
          return this;
        },
        then(resolve, reject) {
          let query = supabase.from(tableObj._name).delete();
          for (const [f, v] of filters) query = query.eq(f, v);
          return query.then(() => resolve()).catch(reject);
        },
      };
    },
  };
}

module.exports = { createDb };
