import ShareButton from "./ui/ShareButton";

interface ResultsProps {
    plotHash: string;
    imageUrl: string;
}

export default function Results({ plotHash, imageUrl }: ResultsProps) {
    return (
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-5xl mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">
                Evaluation Results
            </h2>
            <p className="text-slate-500 mb-6">
                Zero-shot prediction vs High-Fidelity FEM data.
            </p>

            <div className="border rounded-xl overflow-hidden bg-slate-50 flex justify-center p-4">
                <img
                    src={imageUrl}
                    alt={`Plot for hash ${plotHash}`}
                    className="max-w-full h-auto rounded-lg shadow-sm"
                    onError={() =>
                        console.error("Failed to render the Base64 image data.")
                    }
                />
            </div>

            <div className="mt-6 flex justify-between items-center text-sm text-slate-500">
                <p>
                    Hash reference:{" "}
                    <span className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">
                        {plotHash}
                    </span>
                </p>

                {/* action buttons */}
                <div className="flex items-center gap-3">
                    <ShareButton evalHash={plotHash} />

                    <a
                        href={imageUrl}
                        download={`evaluation_${plotHash}.png`}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors flex items-center gap-2"
                    >
                        Download Plot
                    </a>
                </div>
            </div>
        </div>
    );
}
