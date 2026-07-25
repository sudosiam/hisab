import React, { useMemo, useState } from 'react';
import { InlineDropdown } from './InlineDropdown';

export interface FinancialYearOption {
  startYear: number;
  label: string;
}

interface Props {
  label?: string;
  options: FinancialYearOption[];
  value: number;
  onChange: (startYear: number) => void;
}

export function FinancialYearPicker({
  label = 'Financial Year',
  options,
  value,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.startYear === value);

  const dropdownOptions = useMemo(
    () =>
      options.map((option) => ({
        key: String(option.startYear),
        value: option.startYear,
        label: option.label,
      })),
    [options]
  );

  return (
    <InlineDropdown
      label={label}
      placeholder="Select year"
      valueLabel={selected?.label}
      open={open}
      onOpenChange={setOpen}
      options={dropdownOptions}
      selectedValue={value}
      onSelect={onChange}
      emptyText="No financial years"
    />
  );
}
