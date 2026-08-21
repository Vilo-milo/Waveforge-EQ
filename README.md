This is an EQ app built for MacOs on ARM64. Requirements: a Mac with Node.js 18+ (brew install node). Everything else (icon tools, signing) ships with macOS.
To build it as an app:
# get the eq-app folder (git clone / AirDrop / scp)
cd eq-app ##
npm install ##
./build.sh ##
open dist/WaveForge.app ##
./build.sh --install # or copy to /Applications instead
