import { Download } from "lucide-react";

interface DownloadButtonProps {
    imageUrl: string;
    fileName: string;
    text?: string;
}

export default function DownloadButton({
    imageUrl,
    fileName,
    text = "Download Plot",
}: DownloadButtonProps) {
    return (
        <a
            href={imageUrl}
            download={fileName}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all shadow-sm cursor-pointer"
        >
            <Download size={18} />
            {text}
        </a>
    );
}
