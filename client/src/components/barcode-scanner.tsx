import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, ScanBarcode } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onError?: (error: string) => void;
}

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.QR_CODE,
];

export function BarcodeScanner({ onScan, onError }: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const scannerIdRef = useRef(`barcode-scanner-${Date.now()}`);

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      if (scanner) {
        if (isScanningRef.current) {
          scanner.stop().catch(() => {}).finally(() => {
            try { scanner.clear(); } catch {}
          });
        } else {
          try { scanner.clear(); } catch {}
        }
        scannerRef.current = null;
        isScanningRef.current = false;
      }
    };
  }, []);

  const startScanning = async () => {
    try {
      const scannerId = scannerIdRef.current;
      if (!document.getElementById(scannerId)) return;

      if (scannerRef.current) {
        if (isScanningRef.current) {
          try { await scannerRef.current.stop(); } catch {}
        }
        try { scannerRef.current.clear(); } catch {}
        scannerRef.current = null;
        isScanningRef.current = false;
      }

      const scanner = new Html5Qrcode(scannerId, {
        formatsToSupport: BARCODE_FORMATS,
        verbose: false,
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 1.5,
          disableFlip: false,
        },
        (decodedText) => {
          setLastScanned(decodedText);
          onScan(decodedText);
          isScanningRef.current = false;
          scanner.stop().catch(() => {});
          setIsScanning(false);
        },
        () => {}
      );

      isScanningRef.current = true;
      setIsScanning(true);
      setPermissionDenied(false);
    } catch (err: any) {
      isScanningRef.current = false;
      const errMsg = err?.message || String(err);
      if (errMsg.includes("Permission") || errMsg.includes("NotAllowed")) {
        setPermissionDenied(true);
      }
      onError?.(errMsg);
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current && isScanningRef.current) {
      isScanningRef.current = false;
      try { await scannerRef.current.stop(); } catch {}
      try { scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
      setIsScanning(false);
    }
  };

  if (permissionDenied) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CameraOff className="h-12 w-12 text-muted-foreground" />
        <div>
          <p className="font-medium">Camera Access Required</p>
          <p className="text-sm text-muted-foreground mt-1">
            Please allow camera access in your browser settings to scan barcodes.
          </p>
        </div>
        <Button onClick={() => { setPermissionDenied(false); startScanning(); }} data-testid="button-retry-camera">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        id={scannerIdRef.current}
        className="w-full max-w-md rounded-md overflow-hidden bg-muted"
        style={{ minHeight: isScanning ? "300px" : "200px" }}
      />

      {!isScanning && (
        <div className="flex flex-col items-center gap-3">
          {!lastScanned && (
            <div className="text-center">
              <ScanBarcode className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Position the barcode within the scanning area
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports UPC, EAN, Code 128, and other common formats
              </p>
            </div>
          )}
          <Button onClick={startScanning} data-testid="button-start-scan">
            <Camera className="mr-2 h-4 w-4" />
            {lastScanned ? "Scan Another" : "Start Camera"}
          </Button>
        </div>
      )}

      {isScanning && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground animate-pulse">
            Scanning... hold steady over the barcode
          </p>
          <Button variant="outline" onClick={stopScanning} data-testid="button-stop-scan">
            <CameraOff className="mr-2 h-4 w-4" />
            Stop Scanning
          </Button>
        </div>
      )}

      {lastScanned && (
        <p className="text-sm text-muted-foreground">
          Last scanned: <span className="font-mono font-medium text-foreground">{lastScanned}</span>
        </p>
      )}
    </div>
  );
}
