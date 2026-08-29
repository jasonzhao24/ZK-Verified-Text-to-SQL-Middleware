import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'node:path';
export {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
  type ImpureCircuits,
  type PureCircuits,
  type Witnesses,
} from './managed/sql_guard/contract/index.js';
import { Contract, type Witnesses } from './managed/sql_guard/contract/index.js';

export const sqlGuardZkConfigPath = '/home/jason/example-hello-world/contracts/managed/sql_guard';

export function makeSqlGuardWitnesses(queryHash: Uint8Array, isSafeSelect: boolean): Witnesses<{}> {
  return {
    ai_query_metadata: (context) => {
      return [
        context.privateState,
        { query_hash: queryHash, is_safe_select: isSafeSelect },
      ];
    },
  };
}

export function buildCompiledSqlGuardContract(witnesses: Witnesses<{}>) {
  return CompiledContract.make('SqlGuardContract', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(sqlGuardZkConfigPath),
  );
}
