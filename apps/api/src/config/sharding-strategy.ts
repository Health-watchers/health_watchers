export interface ShardingConfig {
  shardKeyPath: string;
  shardKeyType: 'hashed' | 'range' | 'directory';
  rangeDistribution?: {
    min: number;
    max: number;
    ranges: Array<{
      start: number;
      end: number;
      shard: string;
    }>;
  };
  hashFunction?: 'md5' | 'sha1' | 'sha256';
  shardCount: number;
  balanceThreshold?: number; // Percentage imbalance to trigger rebalancing
}

export interface ShardMapping {
  collectionName: string;
  config: ShardingConfig;
  shards: Map<string, ShardInfo>;
}

export interface ShardInfo {
  shardName: string;
  connectionString: string;
  status: 'active' | 'recovering' | 'unavailable';
  primaryNode: string;
  secondaryNodes: string[];
  documentCount: number;
  dataSize: number;
  lastHealthCheck: Date;
}

export interface ShardKeyValue {
  original: any;
  hashed: string;
  shardId: string;
}

export const SHARDING_STRATEGIES: Record<string, ShardingConfig> = {
  // Encounter sharding by clinic (range-based)
  Encounter: {
    shardKeyPath: 'clinicId',
    shardKeyType: 'hashed',
    shardCount: 4,
    hashFunction: 'sha256',
    balanceThreshold: 15,
  },

  // Patient sharding by clinic (range-based for better data locality)
  Patient: {
    shardKeyPath: 'clinicId',
    shardKeyType: 'hashed',
    shardCount: 4,
    hashFunction: 'sha256',
    balanceThreshold: 15,
  },

  // Communication logs sharding by date (range-based for time-series)
  CommunicationLog: {
    shardKeyPath: 'createdAt',
    shardKeyType: 'range',
    shardCount: 12, // 12 months
    rangeDistribution: {
      min: 0,
      max: 11,
      ranges: generateMonthlyRanges(),
    },
  },

  // Audit logs sharding by clinic and date
  AuditLog: {
    shardKeyPath: 'clinicId',
    shardKeyType: 'hashed',
    shardCount: 8,
    hashFunction: 'sha256',
    balanceThreshold: 10,
  },

  // Health logs sharding by patient
  HealthLog: {
    shardKeyPath: 'patientId',
    shardKeyType: 'hashed',
    shardCount: 6,
    hashFunction: 'sha256',
    balanceThreshold: 15,
  },
};

export const SHARD_SERVERS: ShardInfo[] = [
  {
    shardName: 'shard-1',
    connectionString: process.env.MONGO_SHARD_1_URI || 'mongodb://shard-1:27017',
    status: 'active',
    primaryNode: 'shard-1-primary',
    secondaryNodes: ['shard-1-secondary-1', 'shard-1-secondary-2'],
    documentCount: 0,
    dataSize: 0,
    lastHealthCheck: new Date(),
  },
  {
    shardName: 'shard-2',
    connectionString: process.env.MONGO_SHARD_2_URI || 'mongodb://shard-2:27017',
    status: 'active',
    primaryNode: 'shard-2-primary',
    secondaryNodes: ['shard-2-secondary-1', 'shard-2-secondary-2'],
    documentCount: 0,
    dataSize: 0,
    lastHealthCheck: new Date(),
  },
  {
    shardName: 'shard-3',
    connectionString: process.env.MONGO_SHARD_3_URI || 'mongodb://shard-3:27017',
    status: 'active',
    primaryNode: 'shard-3-primary',
    secondaryNodes: ['shard-3-secondary-1', 'shard-3-secondary-2'],
    documentCount: 0,
    dataSize: 0,
    lastHealthCheck: new Date(),
  },
  {
    shardName: 'shard-4',
    connectionString: process.env.MONGO_SHARD_4_URI || 'mongodb://shard-4:27017',
    status: 'active',
    primaryNode: 'shard-4-primary',
    secondaryNodes: ['shard-4-secondary-1', 'shard-4-secondary-2'],
    documentCount: 0,
    dataSize: 0,
    lastHealthCheck: new Date(),
  },
];

export const SHARD_CONFIG: Map<string, ShardMapping> = new Map(
  Object.entries(SHARDING_STRATEGIES).map(([collection, config]) => [
    collection,
    {
      collectionName: collection,
      config,
      shards: new Map(SHARD_SERVERS.map((shard) => [shard.shardName, shard])),
    },
  ])
);

function generateMonthlyRanges() {
  const ranges = [];

  for (let i = 0; i < 12; i++) {
    const nextMonth = i === 11 ? 0 : i + 1;
    ranges.push({
      start: i,
      end: nextMonth,
      shard: `shard-${(i % 4) + 1}`,
    });
  }

  return ranges;
}

export function getShardingConfig(collectionName: string): ShardingConfig | undefined {
  return SHARDING_STRATEGIES[collectionName];
}

export function getShardMapping(collectionName: string): ShardMapping | undefined {
  return SHARD_CONFIG.get(collectionName);
}
