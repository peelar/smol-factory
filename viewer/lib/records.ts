import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import type { ItemRecord } from '../../skills/smol-factory/assets/foundation/records.types';
export type { ItemRecord };

export function readRecords(database = process.env.SMOL_FACTORY_DATABASE || resolve(process.cwd(), '../.smol-factory/local/records.sqlite3')): ItemRecord[] {
  const connection = new DatabaseSync(database, { readOnly: true });
  try {
    connection.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 2000;');
    if (connection.prepare('PRAGMA user_version').get()?.user_version !== 1) {
      throw new Error('Unsupported records database version.');
    }
    const columns = connection.prepare('PRAGMA table_info(item_records)').all().map(row => row.name).sort();
    if (JSON.stringify(columns) !== JSON.stringify(['github_host', 'kind', 'number', 'payload', 'repository', 'revision'])) {
      throw new Error('Unexpected records schema.');
    }
    return connection.prepare('SELECT github_host, repository, kind, number, payload FROM item_records').all().map(row => {
      const record: ItemRecord = JSON.parse(String(row.payload));
      if (record.schemaVersion !== 1 || record.repository?.githubHost !== row.github_host ||
          record.repository?.name !== row.repository || record.item?.kind !== row.kind || record.item?.number !== row.number) {
        throw new Error('Invalid stored record identity.');
      }
      return record;
    });
  } finally { connection.close(); }
}
