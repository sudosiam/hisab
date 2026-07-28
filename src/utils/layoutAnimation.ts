import { LayoutAnimation, Platform, UIManager } from 'react-native';
import { motion } from '../constants/motion';

let androidLayoutAnimationEnabled = false;

export function configureExpandAnimation() {
  if (Platform.OS === 'android' && !androidLayoutAnimationEnabled) {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
      androidLayoutAnimationEnabled = true;
    }
  }
  LayoutAnimation.configureNext({
    duration: motion.layout,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
}
