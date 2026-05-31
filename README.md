# Lobster NFT - FCFS Mint Bot

Bot otomatis untuk **FCFS (First Come First Serve) claim** NFT dari [lobsternft.lol/mint](https://lobsternft.lol/mint).

## Contract Info

| Field | Value |
|-------|-------|
| **Contract** | `0x1de237c7063a9ee531e06a6c3fba4e3e704f2a74` |
| **Type** | Thirdweb ERC721Drop |
| **Chain** | Ethereum Mainnet (chainId: 1) |
| **Max Supply** | 3333 |
| **Mint Function** | `claim(address, uint256, address, uint256, AllowlistProof, bytes)` |

## Features

- **Thirdweb claim()** - Properly formatted claim call with AllowlistProof struct
- **Auto-detect claim condition** - Reads price, start time, and limits from contract
- **FCFS Optimized** - Aggressive gas, parallel wallet execution
- **Multi-wallet support** - Claim dari banyak wallet sekaligus
- **Countdown mode** - Set waktu claim, TX dikirim otomatis
- **Monitor mode** - Polling claim condition sampai live, lalu auto-claim

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Setup environment

```bash
cp .env.example .env
```

Edit `.env` dan isi minimal:
- `PRIVATE_KEY` - Private key wallet kamu
- `RPC_URL` - (opsional) Premium RPC untuk speed (Alchemy/QuickNode)
- `MINT_PRICE` - Harga mint dalam ETH (atau biarkan 0, bot akan auto-detect dari claim condition)

> **Note:** `CONTRACT_ADDRESS` sudah pre-filled dengan Lobster NFT contract.

### 3. Test koneksi

```bash
npm run test-connection
```

### 4. Jalankan Bot

**Monitor mode** (recommended - auto claim saat buka):
```bash
npm start
```

**Instant mode** (langsung claim sekarang):
```bash
npm run instant
```

**Countdown mode** (claim pada waktu tertentu):
```bash
# Edit .env: MINT_START_TIME=2025-06-15T14:00:00Z
npm run countdown
```

**Monitor only** (lihat status tanpa auto-claim):
```bash
npm run monitor
```

## How It Works

1. Bot connects ke Ethereum Mainnet via RPC
2. Reads `getActiveClaimConditionId()` dan `getClaimConditionById()` dari contract
3. Checks `startTimestamp` - jika sudah lewat = mint live
4. Calls `claim(receiver, quantity, currency, pricePerToken, allowlistProof, data)` dengan gas agresif
5. Waits for TX confirmation

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `CONTRACT_ADDRESS` | Lobster NFT contract | `0x1de237c7...704f2a74` |
| `MINT_PRICE` | Mint price in ETH (0=auto-detect) | `0` |
| `MINT_AMOUNT` | Quantity per claim | `1` |
| `CURRENCY` | Payment currency address | Native ETH |
| `PRIVATE_KEY` | Wallet private key | - |
| `BOT_MODE` | monitor/instant/countdown | `monitor` |
| `SPEED_MODE` | turbo/normal | `turbo` |
| `MAX_GAS_PRICE_GWEI` | Max gas price | `100` |
| `PRIORITY_FEE_GWEI` | Priority fee (tip) | `5` |
| `POLL_INTERVAL_MS` | Check interval | `1000` |

## Thirdweb Claim Condition

Bot ini otomatis membaca claim condition dari contract:

- **startTimestamp** - Kapan claim dibuka
- **maxClaimableSupply** - Max supply untuk phase ini
- **supplyClaimed** - Sudah berapa yang di-claim
- **quantityLimitPerWallet** - Max per wallet
- **pricePerToken** - Harga per NFT
- **merkleRoot** - Allowlist root (0x00...00 = public)

Bot auto-detects apakah mint sudah live berdasarkan `startTimestamp`.

## FCFS Strategy

Untuk memaksimalkan chance di FCFS:

1. **Gunakan premium RPC** (Alchemy/QuickNode) - lebih cepat broadcast TX
2. **Set SPEED_MODE=turbo** - langsung pakai max gas
3. **Naikkan PRIORITY_FEE_GWEI** - 5-20 Gwei untuk prioritas di mempool
4. **Multi-wallet** - lebih banyak wallet = lebih banyak chance
5. **POLL_INTERVAL_MS=500** - check lebih sering (hati-hati rate limit RPC)
6. **Countdown mode** - jika tahu exact start time, kirim TX lebih awal

## Security

- Private key HANYA disimpan di `.env` (local)
- `.env` sudah di `.gitignore`
- Tidak ada data yang dikirim ke server external
- Open source - bisa audit sendiri

## Troubleshooting

**"No active claim condition"** - Belum ada phase claim yang aktif di contract

**"Starts in Xm Xs"** - Claim condition ada tapi belum waktunya

**"SOLD OUT"** - `supplyClaimed >= maxClaimableSupply` atau `totalSupply >= maxSupply`

**"Transaction reverted"** - Kemungkinan:
  - Sudah claim max per wallet
  - Salah harga (cek MINT_PRICE)
  - Butuh allowlist proof (bukan public mint)
  - Supply habis (race condition)

**"Gas estimate failed"** - Normal jika claim belum buka, bot pakai fallback gasLimit

**"Insufficient funds"** - Top up wallet: mint price + gas (~0.01-0.05 ETH)

## Disclaimer

Bot ini untuk educational purposes. Gunakan dengan risiko sendiri. Pastikan memahami gas fees dan risiko financial sebelum menggunakan.
