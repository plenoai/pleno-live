import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";

export const Passkey = {
  isSupported: (): boolean => {
    return typeof window !== "undefined" && !!window.PublicKeyCredential;
  },

  register: (options: PublicKeyCredentialCreationOptionsJSON) =>
    startRegistration({ optionsJSON: options }),

  authenticate: (options: PublicKeyCredentialRequestOptionsJSON) =>
    startAuthentication({ optionsJSON: options }),
};
