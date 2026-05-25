# 🎯 BotMint FCFS - SeaDrop Signed Presale

Bot otomatis untuk mint NFT fase **FCFS (First Come First Served)** menggunakan mekanisme **SIGNED_PRESALE** di OpenSea SeaDrop.

## ⚡ Cara Kerja

```
User → OpenSea API (fetch signature) → SeaDrop.mintSigned() → NFT Contract
```

Bot ini:
1. **Monitor** stage FCFS di OpenSea sampai aktif
2. **Fetch signature** dari OpenSea GraphQL API
3. **Execute `mintSigned()`** di SeaDrop contract
4. Support **multi-wallet** untuk mint paralel (kecepatan FCFS!)

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Setup environment
```bash
cp .env.example .env
# Edit .env dengan konfigurasi kamu
```

### 3. Jalankan bot

**Mode Monitor** (recommended untuk FCFS):
```bash
npm start
```
Bot akan polling OpenSea sampai stage FCFS aktif, lalu auto-mint.

**Mode Instant** (langsung mint):
```bash
npm run instant
```

**Test koneksi dulu:**
```bash
npm run test
```

## 📋 Konfigurasi Penting

| Variable | Deskripsi |
|----------|-----------|
| `CONTRACT_ADDRESS` | Alamat NFT contract |
| `COLLECTION_SLUG` | Slug koleksi di OpenSea (dari URL) |
| `STAGE_INDEX` | Index stage FCFS (dari data drop, biasanya 1 atau 2) |
| `MINT_PRICE` | Harga mint per NFT (dalam ETH, "0" untuk free mint) |
| `MINT_AMOUNT` | Jumlah NFT yang mau di-mint |
| `PRIVATE_KEY` | Private key wallet (JANGAN SHARE!) |
| `BOT_MODE` | `monitor` atau `instant` |

## 🔍 Cara Cari Stage Index

Dari data GraphQL OpenSea, kamu bisa lihat stages:
```json
{
  "stages": [
    { "stageType": "SIGNED_PRESALE", "stageIndex": 1, "isEligible": false },
    { "stageType": "SIGNED_PRESALE", "stageIndex": 2, "isEligible": true },  ← Target ini!
    { "stageType": "PUBLIC_SALE", "stageIndex": 0 }
  ]
}
```

Set `STAGE_INDEX=2` untuk target stage FCFS yang eligible.

## 🔐 Keamanan

- Private key **HANYA** disimpan lokal di `.env`
- `.env` sudah ada di `.gitignore`
- Signature dari OpenSea per-wallet & per-session (tidak bisa di-reuse)
- Bot tidak menyimpan data sensitif

## 📦 Dependencies

- `ethers` - Blockchain interaction
- `dotenv` - Environment variables
- `chalk` - Colored terminal output
- `node-notifier` - Desktop notifications

## ⚠️ Catatan

- Bot ini untuk **SIGNED_PRESALE** (FCFS) stage, bukan PUBLIC_SALE
- Pastikan wallet eligible untuk target stage
- Base chain gas sangat murah (<$0.01/tx)
- Untuk multi-wallet, set `PRIVATE_KEYS` (comma-separated)
- OpenSea API rate limit berlaku — gunakan `OPENSEA_API_KEY` jika punya

## 🛠️ Troubleshooting

**"Not eligible for stage X"**
- Wallet belum terdaftar di allowlist FCFS
- Cek di OpenSea drop page apakah wallet eligible

**"Signature not available"**
- Stage belum dibuka (gunakan mode monitor)
- Rate limited oleh OpenSea (tunggu sebentar)

**"Transaction reverted"**
- Mint sudah habis (sold out)
- Sudah mint max per wallet
- Stage sudah berakhir
