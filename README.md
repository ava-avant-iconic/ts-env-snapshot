# ts-env-snapshot

Capture, compare, and diff environment variable snapshots across deploys. Detect added/removed/changed env vars and generate human-readable drift reports for CI/CD pipelines.

## Install

```bash
npm install ts-env-snapshot
```

## Quick Start

```typescript
import { EnvSnapshotManager } from 'ts-env-snapshot';

const manager = new EnvSnapshotManager();

// Capture a snapshot before deploying
const before = manager.capture(process.env, {
  label: 'prod-before-deploy',
  maskKeys: ['DATABASE_URL', 'SECRET_KEY'],
});

// ... deploy happens ...

// Capture after
const after = manager.capture(process.env, {
  label: 'prod-after-deploy',
  maskKeys: ['DATABASE_URL', 'SECRET_KEY'],
});

// Compare
const diff = manager.diff(before, after);
console.log(manager.formatReport(diff));

// Serialize for storage
const json = manager.serialize(before);
// Restore later
const restored = manager.deserialize(json);
```

## API

### `EnvSnapshotManager`

#### `capture(env, options?)`
Captures an environment snapshot with optional filtering and masking.

#### `diff(before, after)`
Compares two snapshots and returns a detailed diff with summary counts.

#### `formatReport(result, options?)`
Generates a human-readable text report from a diff result.

#### `serialize(snapshot)` / `deserialize(json)`
Serialize/deserialize snapshots for storage or transmission.

## License

MIT
