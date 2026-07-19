import { useLayoutEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';
import { ReportPdfButton } from '../components/ReportPdfButton';

export type ReportPdfResult = { success: boolean; message: string };

export function useReportPdfHeader(options: {
  disabled?: boolean;
  onExport: () => Promise<ReportPdfResult>;
}) {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const onExportRef = useRef(options.onExport);
  onExportRef.current = options.onExport;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <ReportPdfButton
          loading={loading}
          disabled={options.disabled}
          onPress={async () => {
            setLoading(true);
            try {
              const result = await onExportRef.current();
              if (!result.success) {
                Alert.alert('Could not create PDF', result.message);
              }
              // Success: system share sheet is the confirmation; avoid a second alert.
            } catch (error) {
              Alert.alert(
                'PDF',
                error instanceof Error ? error.message : 'Could not create PDF.'
              );
            } finally {
              setLoading(false);
            }
          }}
        />
      ),
    });

    return () => {
      navigation.setOptions({ headerRight: undefined });
    };
  }, [navigation, loading, options.disabled]);
}
