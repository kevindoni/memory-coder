# Bridge Quick Start

## Start the bridge

```bash
npm run start:bridge
```

or in dev mode:

```bash
npm run dev:bridge
```

## Use the CLI wrapper

```bash
node dist/cli.js recall --json "{\"query\":\"cors issue\"}"
node dist/cli.js remember --json "{\"content\":\"Use 2-space indentation\",\"type\":\"decision\"}"
```

## Use the Python wrapper

```bash
python integrations/bridge_client.py recall "{\"query\":\"cors issue\"}"
```

## Use the Node wrapper

```bash
node integrations/bridge_client.js recall "{\"query\":\"cors issue\"}"
```
