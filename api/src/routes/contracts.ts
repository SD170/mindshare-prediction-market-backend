import { Router } from 'express';
import { Contract } from '../db';
import { getDateOnly } from '../utils/constants';

const router = Router();

router.get('/', async (req, res) => {
  const contracts = await Contract.find().lean();
  res.json(contracts.map(c => ({
    type: c.type,
    address: c.address,
    metadata: c.metadata,
  })));
});

router.post('/', async (req, res) => {
  const { contracts } = req.body;
  if (!Array.isArray(contracts)) {
    return res.status(400).json({ error: 'contracts array required' });
  }

  try {
    const deploymentDate = new Date();
    const deploymentDateOnly = getDateOnly(deploymentDate);
    
    // Find the highest deployment index for today
    const maxDeploymentDoc = await Contract.findOne({ deploymentDate: deploymentDateOnly })
      .sort({ deploymentIndex: -1 })
      .select('deploymentIndex')
      .lean();
    
    const deploymentIndex = maxDeploymentDoc ? (maxDeploymentDoc.deploymentIndex || 0) + 1 : 0;

    for (const contract of contracts) {
      await Contract.findOneAndUpdate(
        { type: contract.type },
        {
          ...contract,
          deploymentDate: deploymentDateOnly,
          deploymentIndex,
        },
        { upsert: true }
      );
    }

    console.log(`✅ Saved ${contracts.length} contracts (deployment date: ${deploymentDateOnly.toISOString().split('T')[0]}, index: ${deploymentIndex})`);
    res.json({ success: true, count: contracts.length, deploymentDate: deploymentDateOnly.toISOString().split('T')[0], deploymentIndex });
  } catch (error: any) {
    console.error('Error saving contracts:', error);
    res.status(500).json({ error: error.message || 'Failed to save contracts' });
  }
});

export default router;

