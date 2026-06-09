module Utils

using Reactant, Lux

export CDEV, XDEV

# Global variables for the Devices
const CDEV = cpu_device()
const XDEV = reactant_device(; force=true)

end
