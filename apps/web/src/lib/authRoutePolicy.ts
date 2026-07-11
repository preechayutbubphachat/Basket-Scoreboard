export function shouldBootstrapAuthForPath(pathname: string) {
  return !/^\/public(?:\/|$)/.test(pathname);
}
