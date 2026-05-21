type Props = {
  address: string;
  chain?: string;
};

function shorten(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function AddressLink({ address, chain = "mainnet" }: Props) {
  const href = `https://etherscan.io/address/${address}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-mono text-[12px] text-fg-muted underline-offset-4 hover:text-accent hover:underline"
      title={`${address} on ${chain}`}
    >
      {shorten(address)}
    </a>
  );
}
