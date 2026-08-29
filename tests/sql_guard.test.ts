import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import crypto from 'node:crypto';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  deployContract,
  submitCallTx,
  type DeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  type EnvironmentConfiguration,
  waitForFunds,
} from '@midnight-ntwrk/testkit-js';
import pino from 'pino';

import { getConfig } from '../config.js';
import {
  MidnightWalletProvider,
  syncWallet,
  type WalletSecret,
} from '../wallet.js';
import { buildProviders, type HelloWorldProviders } from '../providers.js';
import {
  ledger,
  type Contract,
} from '../../contracts/managed/sql_guard/contract/index.js';
import {
  makeSqlGuardWitnesses,
  buildCompiledSqlGuardContract,
} from '../../contracts/sql-guard-index.js';

// @ts-expect-error WebSocket global assignment for apollo
globalThis.WebSocket = WebSocket;

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  console.error('Promise:', promise);
});

const ALICE_LOCAL_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';
const PRIVATE_STATE_ID = 'AliceSqlGuardState';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

function resolveSecret(): WalletSecret {
  return { kind: 'seed', value: ALICE_LOCAL_SEED };
}

// Simulate the AI's output: a real SQL string, hashed, flagged as safe
const SAMPLE_SQL = 'SELECT * FROM users WHERE active = true;';
const QUERY_HASH: Uint8Array = crypto
  .createHash('sha256')
  .update(SAMPLE_SQL)
  .digest();
const IS_SAFE_SELECT = true;

describe(`SQL Guard Contract (${network})`, () => {
  let wallet: MidnightWalletProvider;
  let providers: HelloWorldProviders;
  let contractAddress: ContractAddress;

  const config = getConfig();
  const secret = resolveSecret();
  const syncTimeoutMs = Number(process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? 10 * 60_000);

  async function queryLedger(p: HelloWorldProviders) {
    const state = await p.publicDataProvider.queryContractState(contractAddress);
    expect(state).not.toBeNull();
    return ledger(state!.data);
  }

  beforeAll(async () => {
    setNetworkId(config.networkId);

    const envConfig: EnvironmentConfiguration = {
      walletNetworkId: config.networkId,
      networkId: config.networkId,
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      node: config.node,
      nodeWS: config.nodeWS,
      faucet: config.faucet,
      proofServer: config.proofServer,
    };

    wallet = await MidnightWalletProvider.build(logger, envConfig, secret);
    await wallet.start();
    await syncWallet(logger, wallet.wallet, syncTimeoutMs);

    providers = buildProviders(wallet, '/home/jason/example-hello-world/contracts/managed/sql_guard', config);
    logger.info(`Providers initialized on '${network}'. Ready to test!`);
  });

  afterAll(async () => {
    if (wallet) {
      logger.info('Stopping wallet...');
      await wallet.stop();
    }
  });

  it('Deploys the sql_guard contract', async () => {
    logger.info('Creating private state...');

    const witnesses = makeSqlGuardWitnesses(QUERY_HASH, IS_SAFE_SELECT);
    const compiledContract = buildCompiledSqlGuardContract(witnesses);

    const deployed: DeployedContract<Contract<{}>> =
      await (deployContract<Contract<{}>>)(providers, {
        compiledContract,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {},
      });

    logger.info('Setting the contract address...');
    contractAddress = deployed.deployTxData.public.contractAddress;
    logger.info(`Contract deployed at: ${contractAddress}`);
    expect(contractAddress).toBeDefined();
    expect(contractAddress.length).toBeGreaterThan(0);
  });

  it('Verifies and logs a safe query hash on-chain', async () => {
    const witnesses = makeSqlGuardWitnesses(QUERY_HASH, IS_SAFE_SELECT);
    const compiledContract = buildCompiledSqlGuardContract(witnesses);

    await (submitCallTx<Contract<{}>, 'verify_and_log_query'>)(providers, {
      compiledContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'verify_and_log_query',
      args: [],
    });

    const state = await queryLedger(providers);
    expect(Buffer.from(state.verified_queries)).toEqual(Buffer.from(QUERY_HASH));

    logger.info(`Verified query hash on-chain: ${Buffer.from(state.verified_queries).toString('hex')}`);
  });
});
