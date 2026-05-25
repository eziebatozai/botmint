/**
 * ABI untuk mint functions yang umum digunakan.
 * 
 * PENTING: Sesuaikan ABI ini dengan contract The Bamboo Order yang sebenarnya.
 * Cara mendapatkan ABI yang benar:
 * 1. Buka contract di Etherscan
 * 2. Tab "Contract" -> "Read Contract" / "Write Contract"
 * 3. Cari function mint yang tersedia
 * 
 * Beberapa variasi mint function yang umum:
 */

const MINT_ABI = [
  // Standard mint(uint256 quantity)
  "function mint(uint256 quantity) external payable",
  
  // Public mint dengan quantity
  "function publicMint(uint256 quantity) external payable",
  
  // Mint tanpa parameter (1 per tx)
  "function mint() external payable",

  // Claim style
  "function claim(uint256 quantity) external payable",

  // Mint dengan proof (whitelist) - jika diperlukan
  "function mint(uint256 quantity, bytes32[] calldata proof) external payable",

  // Read functions untuk monitoring
  "function totalSupply() external view returns (uint256)",
  "function maxSupply() external view returns (uint256)",
  "function MAX_SUPPLY() external view returns (uint256)",
  
  // Mint status checks
  "function mintActive() external view returns (bool)",
  "function isPublicMintActive() external view returns (bool)",
  "function publicSaleActive() external view returns (bool)",
  "function saleIsActive() external view returns (bool)",
  "function paused() external view returns (bool)",
  
  // Price
  "function price() external view returns (uint256)",
  "function mintPrice() external view returns (uint256)",
  "function cost() external view returns (uint256)",
  
  // Per wallet limit
  "function maxMintPerWallet() external view returns (uint256)",
  "function numberMinted(address owner) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
];

module.exports = { MINT_ABI };
