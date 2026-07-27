import { Redirect } from 'expo-router';

/** Legacy Capital hub — Capital items are in the drawer; keep route for old links. */
export default function MoreRedirect() {
  return <Redirect href="/(drawer)/investments" />;
}
