/**
 * ABI untuk OpenSea SeaDrop FCFS (SIGNED_PRESALE) mint mechanism.
 * 
 * PENTING: Untuk FCFS/Presale, user memanggil mintSigned() di SEADROP CONTRACT.
 * Signature diperoleh dari OpenSea API sebelum mint.
 * 
 * Flow: User -> OpenSea API (get signature) -> SeaDrop.mintSigned() -> NFTContract.mintSeaDrop()
 */

// ABI untuk NFT Contract (ERC721SeaDrop) - untuk monitoring/read
const NFT_CONTRACT_ABI = [
  // mintSeaDrop - hanya bisa dipanggil oleh SeaDrop contract
  "function mintSeaDrop(address minter, uint256 quantity) external",
  
  // Read functions
  "function totalSupply() external view returns (uint256)",
  "function maxSupply() external view returns (uint256)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function baseURI() external view returns (string)",
  
  // SeaDrop specific reads
  "function getMintStats(address minter) external view returns (uint256 minterNumMinted, uint256 currentTotalSupply, uint256 maxSupply)",
  "function getPublicDrop(address seaDropImpl) external view returns (tuple(uint80 mintPrice, uint48 startTime, uint48 endTime, uint16 maxTotalMintableByWallet, uint16 feeBps, bool restrictFeeRecipients))",
  "function getAllowedSeaDrop() external view returns (address[])",
];

// ABI untuk SeaDrop Contract - MINT SIGNED untuk FCFS!
const SEADROP_ABI = [
  // Signed mint - fungsi utama untuk FCFS/Presale
  "function mintSigned(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity, tuple(uint80 mintPrice, uint16 maxTotalMintableByWallet, uint48 startTime, uint48 endTime, uint16 dropStageIndex, uint32 maxTokenSupplyForStage, uint16 feeBps, bool restrictFeeRecipients) mintParams, uint256 salt, bytes signature) external payable",

  // Public mint - fallback jika perlu
  "function mintPublic(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity) external payable",
  
  // Get public drop info
  "function getPublicDrop(address nftContract) external view returns (tuple(uint80 mintPrice, uint48 startTime, uint48 endTime, uint16 maxTotalMintableByWallet, uint16 feeBps, bool restrictFeeRecipients))",
  
  // Get fee recipients
  "function getAllowedFeeRecipients(address nftContract) external view returns (address[])",
  
  // Get mint stats
  "function getMintStats(address nftContract, address minter) external view returns (uint256 minterNumMinted, uint256 currentTotalSupply, uint256 maxSupply)",
];

// SeaDrop contract addresses (OpenSea official)
const SEADROP_ADDRESSES = {
  // Base Mainnet
  8453: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',
  // Ethereum Mainnet
  1: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',
  // Sepolia Testnet
  11155111: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',
};

// OpenSea fee recipient (official)
const OPENSEA_FEE_RECIPIENT = '0x0000a26b00c1F0DF003000390027140000fAa719';

module.exports = { 
  NFT_CONTRACT_ABI, 
  SEADROP_ABI, 
  SEADROP_ADDRESSES, 
  OPENSEA_FEE_RECIPIENT,
};
