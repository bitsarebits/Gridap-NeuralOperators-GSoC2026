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
                    src={`http://localhost:8080${imageUrl}`}
                    alt={`Plot for hash ${plotHash}`}
                    className="max-w-full h-auto rounded-lg shadow-sm"
                    onError={(e) =>
                        console.error(
                            "Image not found at URL:",
                            e.currentTarget.src,
                        )
                    }
                />
            </div>

            <div className="mt-4 flex justify-between items-center text-sm text-slate-500">
                <p>
                    Hash reference:{" "}
                    <span className="font-mono bg-slate-100 px-2 py-1 rounded">
                        {plotHash}
                    </span>
                </p>
                <a
                    href={`http://localhost:8080${imageUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline font-medium"
                >
                    Open Image in New Tab
                </a>
            </div>
        </div>
    );
}
