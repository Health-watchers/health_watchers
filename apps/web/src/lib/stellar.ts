export function getStellarExplorerUrl(txHash: string, network: string): string {
  const baseUrl = network === 'mainnet'
    ? 'https://stellar.expert/explorer/public/tx/'
    : 'https://stellar.expert/explorer/testnet/tx/';
  return `${baseUrl}${txHash}`;
}
