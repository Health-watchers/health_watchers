/**
 * @swagger
 * /cds/rules:
 *   get:
 *     summary: List all CDS rules
 *     tags: [CDS]
 *     parameters:
 *       - in: query
 *         name: clinicId
 *         schema:
 *           type: string
 *         description: Filter by clinic ID (returns global + clinic-specific rules)
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of CDS rules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CDSRule'
 *       500:
 *         description: Server error
 *
 *   post:
 *     summary: Create a new CDS rule
 *     tags: [CDS]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ruleId
 *               - name
 *               - category
 *               - trigger
 *               - conditions
 *               - action
 *             properties:
 *               ruleId:
 *                 type: string
 *                 description: Unique rule identifier
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [drug_interaction, screening, vital_sign, care_gap, allergy]
 *               trigger:
 *                 type: string
 *                 enum: [encounter_create, prescription_add, vital_sign_record]
 *               conditions:
 *                 type: object
 *                 description: JSON rule definition
 *               action:
 *                 type: object
 *                 required:
 *                   - type
 *                   - message
 *                   - severity
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [alert, recommendation, block]
 *                   message:
 *                     type: string
 *                   severity:
 *                     type: string
 *                     enum: [info, warning, critical]
 *               clinicId:
 *                 type: string
 *                 description: Optional clinic ID for clinic-specific rules
 *     responses:
 *       201:
 *         description: Rule created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CDSRule'
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 *
 * /cds/rules/{ruleId}:
 *   put:
 *     summary: Update a CDS rule
 *     tags: [CDS]
 *     parameters:
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               conditions:
 *                 type: object
 *               action:
 *                 type: object
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Rule updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CDSRule'
 *       404:
 *         description: Rule not found
 *       500:
 *         description: Server error
 *
 *   delete:
 *     summary: Deactivate a CDS rule
 *     tags: [CDS]
 *     parameters:
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Rule deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CDSRule'
 *       404:
 *         description: Rule not found
 *       500:
 *         description: Server error
 *
 * /cds/evaluate:
 *   post:
 *     summary: Evaluate CDS rules for a patient scenario
 *     tags: [CDS]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - trigger
 *               - patientId
 *               - clinicId
 *             properties:
 *               trigger:
 *                 type: string
 *                 enum: [encounter_create, prescription_add, vital_sign_record]
 *               patientId:
 *                 type: string
 *               clinicId:
 *                 type: string
 *               vitalSigns:
 *                 type: object
 *                 properties:
 *                   bloodPressure:
 *                     type: string
 *                   heartRate:
 *                     type: number
 *                   temperature:
 *                     type: number
 *                   oxygenSaturation:
 *                     type: number
 *               prescription:
 *                 type: object
 *                 properties:
 *                   drugName:
 *                     type: string
 *     responses:
 *       200:
 *         description: Rules evaluated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 alerts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CDSAlert'
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 *
 * components:
 *   schemas:
 *     CDSRule:
 *       type: object
 *       properties:
 *         ruleId:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         category:
 *           type: string
 *           enum: [drug_interaction, screening, vital_sign, care_gap, allergy]
 *         trigger:
 *           type: string
 *           enum: [encounter_create, prescription_add, vital_sign_record]
 *         conditions:
 *           type: object
 *         action:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *               enum: [alert, recommendation, block]
 *             message:
 *               type: string
 *             severity:
 *               type: string
 *               enum: [info, warning, critical]
 *         isActive:
 *           type: boolean
 *         clinicId:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     CDSAlert:
 *       type: object
 *       properties:
 *         ruleId:
 *           type: string
 *         severity:
 *           type: string
 *           enum: [info, warning, critical]
 *         message:
 *           type: string
 *         action:
 *           type: string
 *           enum: [alert, recommendation, block]
 *         acknowledged:
 *           type: boolean
 *         acknowledgedAt:
 *           type: string
 *           format: date-time
 *         acknowledgedBy:
 *           type: string
 */
