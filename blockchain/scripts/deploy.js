const hre=require("hardhat");
async function main(){const Factory=await hre.ethers.getContractFactory("JusticeEvidence");const c=await Factory.deploy();await c.waitForDeployment();console.log("JusticeEvidence deployed to:",await c.getAddress());}
main().catch(e=>{console.error(e);process.exitCode=1;});
