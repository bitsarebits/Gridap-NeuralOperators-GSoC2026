using DrWatson, Test, JSON3, CodecZlib
@quickactivate "experiments_NeuralOperators"

using experiments_NeuralOperators.RegistryArtifacts

println("Starting RegistryArtifacts test suite...")
start_time = time()

@testset "RegistryArtifacts" begin
    @testset "Hash and solver validation" begin
        @test validate_hash("ABCDEF012345") == "abcdef012345"
        @test validate_hash("abcdef012345") == "abcdef012345"
        @test_throws ArgumentError validate_hash("not-a-hash")
        @test_throws ArgumentError validate_hash(nothing)

        @test validate_solver_dir("FNOSolver") == "fnosolver"
        @test validate_solver_dir("fno") == "fno"
        @test solver_dir_candidates("FNOSolver") == ["fnosolver", "fno"]
        @test solver_dir_candidates("fno") == ["fno", "fnosolver"]
        @test solver_dir_candidates("DeepONetSolver") == ["deeponetsolver", "deeponet"]
        @test_throws ArgumentError validate_solver_dir("../../tmp")
        @test_throws ArgumentError validate_solver_dir("unknown-solver")
    end

    @testset "Path containment" begin
        mktempdir() do root
            base = joinpath(root, "plots")
            mkpath(base)

            expected = joinpath(base, "fnosolver", "eval_abcdef012345.json")
            @test safe_joinpath(base, "fnosolver", "eval_abcdef012345.json") == expected
            @test_throws ArgumentError safe_joinpath(base, "..", "outside.json")
            @test_throws ArgumentError safe_joinpath(base, "fnosolver", "..", "..", "outside.json")

            # Existing legacy paths are discoverable by sharing/deletion flows.
            legacy_file = joinpath(base, "fno", "eval_abcdef012345.json")
            mkpath(dirname(legacy_file))
            write(legacy_file, "{}")
            @test find_existing_solver_artifact(
                base, "FNOSolver", "eval_abcdef012345.json",
            ) == legacy_file
            @test isnothing(find_existing_solver_artifact(
                base, "FNOSolver", "eval_aaaaaaaaaaaa.json",
            ))
        end
    end

    @testset "Physical local-presence flags" begin
        data_hash = "111111111111"
        model_hash = "222222222222"
        eval_hash = "333333333333"

        registry = Dict{String,Any}(
            "data" => Dict(data_hash => Dict("nx" => 100)),
            "models" => Dict(model_hash => Dict(
                "solver_type" => "FNOSolver",
                "solver" => Dict("epochs" => 10),
                "data_hash" => data_hash,
            )),
            "evaluations" => Dict(eval_hash => Dict(
                "model_hash" => model_hash,
                "eval_config" => Dict("sigma_test" => 1.5),
                "benchmark_version" => 2,
            )),
        )

        mktempdir() do root
            data_dir = joinpath(root, "sims")
            models_dir = joinpath(root, "models")
            plots_dir = joinpath(root, "plots")

            first_snapshot = with_local_presence(
                registry;
                data_dir,
                models_dir,
                plots_dir,
            )
            @test first_snapshot["data"][data_hash]["_isLocal"] == false
            @test first_snapshot["models"][model_hash]["_isLocal"] == false
            @test first_snapshot["evaluations"][eval_hash]["_isLocal"] == false
            @test !haskey(registry["data"][data_hash], "_isLocal") # input is not mutated

            mkpath(data_dir)
            write(joinpath(data_dir, "data_$(data_hash).jld2"), "dataset")
            mkpath(joinpath(models_dir, "fnosolver"))
            write(joinpath(models_dir, "fnosolver", "model_$(model_hash).jld2"), "weights")
            mkpath(joinpath(plots_dir, "fnosolver"))
            write(joinpath(plots_dir, "fnosolver", "eval_$(eval_hash).json"),
                JSON3.write(Dict("benchmark_version" => 2, "eval_hash" => eval_hash)))

            second_snapshot = with_local_presence(
                registry;
                data_dir,
                models_dir,
                plots_dir,
            )
            @test second_snapshot["data"][data_hash]["_isLocal"] == true
            @test second_snapshot["models"][model_hash]["_isLocal"] == true
            @test second_snapshot["evaluations"][eval_hash]["_isLocal"] == true

            # A truncated/corrupt JSON file is not advertised as a valid local evaluation.
            write(joinpath(plots_dir, "fnosolver", "eval_$(eval_hash).json"), "{broken")
            third_snapshot = with_local_presence(
                registry;
                data_dir,
                models_dir,
                plots_dir,
            )
            @test third_snapshot["evaluations"][eval_hash]["_isLocal"] == false
        end
    end

    @testset "Evaluation JSON transport decoding" begin
        raw = Vector{UInt8}(codeunits(JSON3.write(Dict("benchmark_version" => 2))))
        compressed = transcode(GzipCompressor, raw)
        @test decode_evaluation_json_bytes(raw) == raw
        decoded = decode_evaluation_json_bytes(compressed)
        @test JSON3.read(String(copy(decoded)))["benchmark_version"] == 2
        @test_throws Exception decode_evaluation_json_bytes(Vector{UInt8}(codeunits("{broken")))
    end

    @testset "Evaluation JSON path resolution and parsing" begin
        eval_hash = "abcdef012345"
        model_hash = "fedcba543210"
        registry = Dict{String,Any}(
            "data" => Dict{String,Any}(),
            "models" => Dict(model_hash => Dict("solver_type" => "FNOSolver")),
            "evaluations" => Dict(eval_hash => Dict("model_hash" => model_hash)),
        )

        mktempdir() do plots_dir
            # Legacy short directory remains readable; the registry's current solver
            # name is the primary lookup and the legacy alias is the fallback.
            legacy_dir = joinpath(plots_dir, "fno")
            mkpath(legacy_dir)
            artifact_path = joinpath(legacy_dir, "eval_$(eval_hash).json")
            write(artifact_path, JSON3.write(Dict(
                "eval_hash" => eval_hash,
                "benchmark_version" => 2,
            )))

            result = read_evaluation_json(eval_hash, registry, plots_dir)
            @test result.status == :ok
            @test result.path == artifact_path
            @test result.data["benchmark_version"] == 2

            missing = read_evaluation_json("aaaaaaaaaaaa", registry, plots_dir; solver_hint="FNOSolver")
            @test missing.status == :not_found
            @test length(missing.searched_paths) == 2

            write(artifact_path, "{broken")
            corrupted = read_evaluation_json(eval_hash, registry, plots_dir)
            @test corrupted.status == :invalid_json
            @test corrupted.path == artifact_path

            @test_throws ArgumentError read_evaluation_json("../../etc/passwd", registry, plots_dir; solver_hint="FNOSolver")
        end
    end

    @testset "Artifact sync only succeeds after a real download" begin
        mktempdir() do root
            existing = joinpath(root, "existing", "artifact.jld2")
            mkpath(dirname(existing))
            write(existing, "cached")
            calls = Ref(0)
            downloaded = ensure_artifact!(existing, path -> begin
                calls[] += 1
                write(path, "should not overwrite cache")
            end)
            @test downloaded == false
            @test calls[] == 0
            @test read(existing, String) == "cached"

            absent = joinpath(root, "new", "artifact.jld2")
            downloaded = ensure_artifact!(absent, path -> write(path, "downloaded"))
            @test downloaded == true
            @test read(absent, String) == "downloaded"

            empty_file = joinpath(root, "empty", "artifact.json")
            mkpath(dirname(empty_file))
            write(empty_file, "{broken")
            repaired = ensure_artifact!(
                empty_file,
                path -> write(path, JSON3.write(Dict("ok" => true)));
                validator=is_valid_evaluation_json,
            )
            @test repaired == true
            @test is_valid_evaluation_json(empty_file)

            failed = joinpath(root, "failed", "artifact.jld2")
            @test_throws ErrorException ensure_artifact!(failed, _ -> nothing)
            @test !isfile(failed)
        end
    end
end

elapsed = time() - start_time
println("\nRegistryArtifacts tests completed in $(round(elapsed; digits=2)) seconds.")
