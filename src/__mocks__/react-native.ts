export const Platform = {
  OS: 'android' as 'android' | 'ios' | 'web' | 'windows' | 'macos',
  select: <T,>(spec: { android?: T; ios?: T; default?: T }): T | undefined =>
    spec.android ?? spec.default,
};

export default { Platform };
