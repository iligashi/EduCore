import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { tokenStore } from "../services/api";
import type { NotificationItem } from "../types";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";

export function useSocket(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !tokenStore.accessToken) return;
    const socket = io(SOCKET_URL, {
      auth: { token: tokenStore.accessToken }
    });

    socket.on("notification:new", (notification: NotificationItem) => {
      queryClient.setQueryData<{ data: NotificationItem[] }>(["notifications"], (current) => ({
        data: [notification, ...(current?.data ?? [])]
      }));
    });

    socket.on("submission:new", () => {
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
    });

    socket.on("quiz:available", () => {
      queryClient.invalidateQueries({ queryKey: ["student-quiz-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });

    socket.on("quiz:started", () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-sessions"] });
    });

    socket.on("quiz:submitted", () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-results"] });
      queryClient.invalidateQueries({ queryKey: ["quiz-sessions"] });
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, queryClient]);
}
