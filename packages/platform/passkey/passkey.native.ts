import { Passkey as RNPasskey } from "react-native-passkeys";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";

export const Passkey = {
  isSupported: (): boolean => {
    return RNPasskey.isSupported();
  },

  register: (options: PublicKeyCredentialCreationOptionsJSON) =>
    RNPasskey.create(options),

  authenticate: (options: PublicKeyCredentialRequestOptionsJSON) =>
    RNPasskey.get(options),
};
