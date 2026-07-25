import React, { useMemo, useState } from 'react';
import { InlineDropdown } from './InlineDropdown';
import type { Account } from '../types';

interface Props {
  label?: string;
  accounts: Account[];
  value: number;
  onChange: (accountId: number) => void;
}

export function AccountPicker({ label = 'Account', accounts, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((a) => a.id === value);

  const options = useMemo(
    () =>
      accounts.map((a) => ({
        key: String(a.id),
        value: a.id,
        label: a.name,
      })),
    [accounts]
  );

  return (
    <InlineDropdown
      label={label}
      placeholder="Select account"
      valueLabel={selected?.name}
      open={open}
      onOpenChange={setOpen}
      options={options}
      selectedValue={value || null}
      onSelect={onChange}
      emptyText="No accounts"
    />
  );
}
