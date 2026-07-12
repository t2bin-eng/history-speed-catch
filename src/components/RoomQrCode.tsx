"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export interface RoomQrCodeProps {
  roomCode: string;
  size?: number;
}

/**
 * 방 코드가 미리 채워진 학생 입장 URL(/student?code=)을 QR로 보여준다.
 * 스캔하면 방 코드 입력 없이 바로 닉네임만 쓰고 입장할 수 있다.
 */
export default function RoomQrCode({ roomCode, size = 160 }: RoomQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const joinUrl = `${window.location.origin}/student?code=${roomCode}`;
    let active = true;
    QRCode.toDataURL(joinUrl, { width: size, margin: 1 }).then((url) => {
      if (active) setDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [roomCode, size]);

  if (!dataUrl) {
    return <div style={{ width: size, height: size }} className="animate-pulse rounded-md bg-gray-200" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt={`방 코드 ${roomCode} 입장 QR코드`}
      width={size}
      height={size}
      className="rounded-md border"
    />
  );
}
