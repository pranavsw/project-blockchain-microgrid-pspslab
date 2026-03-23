cmake_minimum_required(VERSION 3.14)
project(MicrogridSim VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Fetch third-party dependencies ────────────────────────────────────────────
include(FetchContent)

# nlohmann/json — Header-only JSON library
FetchContent_Declare(
    nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3
)
FetchContent_MakeAvailable(nlohmann_json)

# cpp-httplib — Header-only HTTP library
FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG        v0.15.3
)
FetchContent_MakeAvailable(httplib)

# ── Build target ──────────────────────────────────────────────────────────────
add_executable(microgrid_sim main.cpp)

target_link_libraries(microgrid_sim PRIVATE
    nlohmann_json::nlohmann_json
    httplib::httplib
)

# Windows-specific: WinSock is needed for httplib
if(WIN32)
    target_link_libraries(microgrid_sim PRIVATE ws2_32)
endif()
