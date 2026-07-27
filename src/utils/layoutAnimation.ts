import { LayoutAnimation, Platform, UIManager } from 'react-native';

let androidLayoutAnimationEnabled = false;

export function configureExpandAnimation() {
  if (Platform.OS === 'android' && !androidLayoutAnimationEnabled) {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
      androidLayoutAnimationEnabled = true;
    }
  }
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}
