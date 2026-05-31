# Lobster NFT - FCFS Mint Bot

Bot otomatis untuk **FCFS (First Come First Serve) mint** NFT **Lobster NFT** dari [lobsternft.lol/mint](https://lobsternft.lol/mint).

## Features

- **FCFS Optimized** - Pre-sign TX, aggressive gas, parallel execution
- **Auto-detect mint status** - Monitor contract sampai mint buka
- **Multi-wallet support** - Mint dari banyak wallet sekaligus
- **Countdown mode** - Set waktu mint, TX dikirim otomatis
- **Multiple mint functions** - Support berbagai jenis contract
- **Turbo speed mode** - Max gas + pre-signed TX untuk speed

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Setup environment

```bash
cp .env.example .env
```

Edit `.env` dan isi:
- `CONTRACT_ADDRESS` - Contract address Lobster NFT (cek di lobsternft.lol atau Etherscan)
- `PRIVATE_KEY` - Private key wallet kamu
- `MINT_PRICE` - Harga mint (dalam ETH, contoh: 0.01)
- `MINT_FUNCTION` - Nama function mint di contract (cek Etherscan)

### 3. Cara cek Contract Address & Mint Function

1. Buka https://lobsternft.lol/mint
2. Inspect element (F12) -> Network tab -> cari request ke contract
3. Atau cek di Etherscan jika contract sudah diverified
4. Lihat "Write Contract" untuk nama function mint

### 4. Jalankan Bot

**Monitor mode** (recommended - auto mint saat buka):
```bash
npm start
```

**Instant mode** (langsung mint sekarang):
```bash
npm run instant
```

**Countdown mode** (mint pada waktu tertentu):
```bash
# Edit .env: MINT_START_TIME=2025-01-15T14:00:00Z
npm run countdown
```

**Monitor only** (tanpa auto-mint):
```bash
npm run monitor
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `CONTRACT_ADDRESS` | Lobster NFT contract | - |
| `MINT_PRICE` | Mint price in ETH | `0` |
| `MINT_AMOUNT` | Quantity per mint | `1` |
| `MINT_FUNCTION` | Contract function name | `mint` |
| `PRIVATE_KEY` | Wallet private key | - |
| `BOT_MODE` | monitor/instant/countdown | `monitor` |
| `SPEED_MODE` | turbo/normal | `turbo` |
| `MAX_GAS_PRICE_GWEI` | Max gas price | `100` |
| `PRIORITY_FEE_GWEI` | Priority fee (tip) | `5` |
| `PRE_SIGN` | Pre-sign TX for speed | `true` |
| `POLL_INTERVAL_MS` | Check interval | `1000` |

## Supported Mint Functions

Bot ini auto-detect berbagai jenis mint function:

| Function | Usage |
|----------|-------|
| `mint` | Standard ERC721A mint |
| `publicMint` | Public mint variant |
| `mintPublic` | Another variant |
| `claim` | Claim-style mint |
| `purchase` | Purchase-style |
| `custom` | Custom function (set CUSTOM_MINT_SIG) |

## FCFS Strategy

Untuk memaksimalkan chance di FCFS mint:

1. **Gunakan premium RPC** (Alchemy/QuickNode) - lebih cepat broadcast
2. **Set SPEED_MODE=turbo** - aggressive gas settings
3. **Set PRE_SIGN=true** - TX sudah signed sebelum mint buka
4. **Naikkan PRIORITY_FEE_GWEI** - 5-20 Gwei untuk prioritas
5. **Multi-wallet** - lebih banyak wallet = lebih banyak chance
6. **POLL_INTERVAL_MS=500** - check lebih sering (hati-hati rate limit)

## Security

- Private key HANYA disimpan di `.env` (local)
- `.env` sudah di `.gitignore`
- Tidak ada data yang dikirim ke server external
- Open source - bisa audit sendiri

## Troubleshooting

**"Mint not active"** - Contract belum buka mint, bot akan terus polling

**"Transaction reverted"** - Kemungkinan:
  - Mint sudah sold out
  - Sudah mint max per wallet
  - Mint belum buka (timing issue)
  - Wrong mint function name
  - Wrong mint price

**"Gas estimate failed"** - Normal jika mint belum buka, bot pakai fallback gasLimit

**"Insufficient funds"** - Top up wallet: mint price + gas (~0.01-0.05 ETH)

## Disclaimer

Bot ini untuk educational purposes. Gunakan dengan risiko sendiri. Pastikan memahami gas fees dan risiko financial sebelum menggunakan.
