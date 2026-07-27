import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert } from 'react-native';
import { FinancialYearPicker } from '../../../src/components/FinancialYearPicker';
import { useScreenStyles } from '../../../src/components/ui';
import { useFinancialYear } from '../../../src/context/FinancialYearContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { getFinancialYearRangeLabel, MONTH_SHORT_NAMES } from '../../../src/utils/date';
import { SettingsDivider, useSettingsStyles } from '../../../src/components/settings/settingsUi';

export default function FinancialYearSettingsScreen() {
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { colors } = useTheme();
  const {
    fyStartMonth,
    selectedFyStartYear,
    fyOptions,
    savingFy,
    setFyStartMonth,
    setSelectedFyStartYear,
  } = useFinancialYear();

  const handleFyStartMonthChange = async (month: number) => {
    try {
      await setFyStartMonth(month);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save start month');
    }
  };

  const handleFyChange = async (startYear: number) => {
    try {
      await setSelectedFyStartYear(startYear);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save financial year');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={localStyles.sectionCard}>
        <FinancialYearPicker
          label=""
          options={fyOptions}
          value={selectedFyStartYear}
          onChange={handleFyChange}
        />
        <SettingsDivider color={colors.borderLight} />
        <Text style={localStyles.rowLabel}>Year starts in</Text>
        <Text style={localStyles.rowMeta}>{getFinancialYearRangeLabel(fyStartMonth)}</Text>
        <View style={localStyles.monthGrid}>
          {MONTH_SHORT_NAMES.map((label, index) => {
            const month = index + 1;
            const active = fyStartMonth === month;
            return (
              <TouchableOpacity
                key={label}
                style={[localStyles.monthChip, active && localStyles.monthChipActive]}
                onPress={() => handleFyStartMonthChange(month)}
                disabled={savingFy}
                accessibilityLabel={`Financial year starts in ${label}`}
              >
                <Text style={active ? localStyles.monthChipTextActive : localStyles.monthChipText}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
