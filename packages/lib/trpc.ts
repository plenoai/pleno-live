import { useCallback, useState } from "react";
import superjson from "superjson";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/apps/server/routers";
import { API_BASE_URL } from "./api";

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

/**
 * tRPC v11 HTTP プロトコル（batch=1 + superjson）を直接話す最小クライアント。
 * サーバー側は @trpc/server のまま変更なし。@trpc/client / @trpc/react-query /
 * @tanstack/react-query をクライアントバンドルから排除するための置換。
 */
export async function callMutation<TInput, TOutput>(
  procedurePath: string,
  input: TInput,
): Promise<TOutput> {
  const response = await fetch(
    `${API_BASE_URL}/api/trpc/${procedurePath}?batch=1`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 0: superjson.serialize(input) }),
    },
  );

  const payload = (await response.json()) as {
    result?: { data?: unknown };
    error?: unknown;
  }[];
  const item = payload[0];

  if (item && "error" in item && item.error) {
    const envelope = item.error as {
      json?: { message?: string };
      message?: string;
    };
    const message = envelope.json?.message ?? envelope.message;
    throw new Error(message ?? `RPC error (HTTP ${response.status})`);
  }

  return superjson.deserialize(item?.result?.data as any) as TOutput;
}

/** useMutation 互換の最小フック（isPending + mutateAsync） */
function createMutation<TInput, TOutput>(procedurePath: string) {
  return {
    useMutation(): {
      mutateAsync: (input: TInput) => Promise<TOutput>;
      isPending: boolean;
    } {
      const [isPending, setIsPending] = useState(false);
      const mutateAsync = useCallback(
        async (input: TInput): Promise<TOutput> => {
          setIsPending(true);
          try {
            return await callMutation<TInput, TOutput>(procedurePath, input);
          } finally {
            setIsPending(false);
          }
        },
        [procedurePath],
      );
      return { mutateAsync, isPending };
    },
  };
}

export const trpc = {
  ai: {
    transcribe: createMutation<
      RouterInput["ai"]["transcribe"],
      RouterOutput["ai"]["transcribe"]
    >("ai.transcribe"),
    analyze: createMutation<
      RouterInput["ai"]["analyze"],
      RouterOutput["ai"]["analyze"]
    >("ai.analyze"),
    askQuestion: createMutation<
      RouterInput["ai"]["askQuestion"],
      RouterOutput["ai"]["askQuestion"]
    >("ai.askQuestion"),
    refineTranscript: createMutation<
      RouterInput["ai"]["refineTranscript"],
      RouterOutput["ai"]["refineTranscript"]
    >("ai.refineTranscript"),
    translate: createMutation<
      RouterInput["ai"]["translate"],
      RouterOutput["ai"]["translate"]
    >("ai.translate"),
    generateTags: createMutation<
      RouterInput["ai"]["generateTags"],
      RouterOutput["ai"]["generateTags"]
    >("ai.generateTags"),
    extractActionItems: createMutation<
      RouterInput["ai"]["extractActionItems"],
      RouterOutput["ai"]["extractActionItems"]
    >("ai.extractActionItems"),
    analyzeSentiment: createMutation<
      RouterInput["ai"]["analyzeSentiment"],
      RouterOutput["ai"]["analyzeSentiment"]
    >("ai.analyzeSentiment"),
    extractKeywords: createMutation<
      RouterInput["ai"]["extractKeywords"],
      RouterOutput["ai"]["extractKeywords"]
    >("ai.extractKeywords"),
    exportMarkdown: createMutation<
      RouterInput["ai"]["exportMarkdown"],
      RouterOutput["ai"]["exportMarkdown"]
    >("ai.exportMarkdown"),
    importRecording: createMutation<
      RouterInput["ai"]["importRecording"],
      RouterOutput["ai"]["importRecording"]
    >("ai.importRecording"),
  },
};
