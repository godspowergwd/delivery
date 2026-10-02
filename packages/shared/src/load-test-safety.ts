function ipv4Loopback(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length < 1 || parts.length > 4) return false;
  const values = parts.map((part) => {
    if (/^0x[\da-f]+$/i.test(part)) return Number.parseInt(part.slice(2), 16);
    if (/^0[0-7]+$/.test(part)) return Number.parseInt(part, 8);
    if (/^\d+$/.test(part)) return Number(part);
    return Number.NaN;
  });
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) return false;
  if (values.slice(0, -1).some((value) => value > 255)) return false;
  const lastLimit = 2 ** (8 * (5 - values.length));
  if (values.at(-1)! >= lastLimit) return false;
  const address = values.slice(0, -1).reduce(
    (result, value, index) => result + value * 2 ** (8 * (3 - index)),
    values.at(-1)!,
  );
  return Math.floor(address / 2 ** 24) === 127;
}

function ipv6Words(hostname: string): number[] | null {
  let address = hostname.toLowerCase();
  if (address.includes('%')) return null;

  const lastColon = address.lastIndexOf(':');
  const ipv4Tail = address.slice(lastColon + 1);
  if (ipv4Tail.includes('.')) {
    const octets = ipv4Tail.split('.');
    if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part))) return null;
    const numericOctets = octets.map(Number);
    if (!ipv4Loopback(ipv4Tail)) return null;
    address = `${address.slice(0, lastColon + 1)}${((numericOctets[0] << 8) | numericOctets[1]).toString(16)}:${((numericOctets[2] << 8) | numericOctets[3]).toString(16)}`;
  }

  if ((address.match(/::/g) ?? []).length > 1) return null;
  const compressed = address.includes('::');
  const [leftText, rightText = ''] = address.split('::');
  const left = leftText ? leftText.split(':') : [];
  const right = rightText ? rightText.split(':') : [];
  const words = [...left, ...right];
  if (words.some((word) => !/^[\da-f]{1,4}$/.test(word))) return null;
  if ((!compressed && words.length !== 8) || (compressed && words.length >= 8)) return null;
  const zeroes = compressed ? Array(8 - words.length).fill('0') : [];
  return [...left, ...zeroes, ...right].map((word) => Number.parseInt(word, 16));
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || ipv4Loopback(normalized)) return true;

  const words = ipv6Words(normalized);
  if (!words) return false;
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true;

  const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const compatible = words.slice(0, 6).every((word) => word === 0);
  const ipv4FirstOctet = words[6] >> 8;
  return (mapped || compatible) && ipv4FirstOctet === 127;
}

export function isLoopbackDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const match = /^(postgres(?:ql)?:)\/\/([^/?#]+)(?:\/[^?#]*)?(?:[?#].*)?$/i.exec(value);
    if (!match) return false;
    const hostAndPort = match[2].slice(match[2].lastIndexOf('@') + 1);
    const hostname = hostAndPort.startsWith('[')
      ? hostAndPort.slice(1, hostAndPort.indexOf(']'))
      : hostAndPort.split(':')[0];
    if (!hostname || !isLoopbackHostname(hostname)) return false;

    const query = value.split('?', 2)[1]?.split('#', 1)[0];
    if (!query) return true;
    for (const pair of query.split('&')) {
      const [rawKey, rawValue = ''] = pair.split('=', 2);
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' ')).toLowerCase();
      if (key === 'service') return false;
      if (key === 'host' || key === 'hostaddr') {
        const override = decodeURIComponent(rawValue.replace(/\+/g, ' '));
        const hosts = override.split(',');
        if (hosts.length !== 1 || !isLoopbackHostname(hosts[0].trim())) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function isIsolatedLoadTestDatabaseUrl(value: string | undefined): boolean {
  if (!value || !isLoopbackDatabaseUrl(value)) return false;
  try {
    const match = /^postgres(?:ql)?:\/\/[^/?#]+\/([^?#]*)(?:[?#].*)?$/i.exec(value);
    if (!match) return false;
    const databaseName = decodeURIComponent(match[1]);
    return /(?:^|[_-])(?:load[_-]?test|test)$/i.test(databaseName);
  } catch {
    return false;
  }
}