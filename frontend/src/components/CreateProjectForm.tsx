'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { ProjectType } from '@/lib/types';
import { Input, Textarea, Select, Button } from '@/components/ui';
import { riseItem, staggerContainer } from '@/components/animations/motion';
import { useToast } from '@/components/Toast';
import { MapPin, Loader2 } from 'lucide-react';

const DEFAULT_POLYGON = JSON.stringify(
  {
    type: 'Polygon',
    coordinates: [
      [
        [-60.0, -3.0],
        [-59.9, -3.0],
        [-59.9, -2.9],
        [-60.0, -2.9],
        [-60.0, -3.0],
      ],
    ],
  },
  null,
  2,
);

const PROJECT_TYPES: { value: ProjectType; label: string; desc: string }[] = [
  { value: 'REFORESTATION', label: 'Reforestation', desc: 'Forest restoration & afforestation' },
  { value: 'SOIL_CARBON', label: 'Soil Carbon', desc: 'Regenerative agriculture' },
  { value: 'RENEWABLE_ENERGY', label: 'Renewable Energy', desc: 'Solar, wind & hydro' },
];

export default function CreateProjectForm({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [projectName, setProjectName] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('REFORESTATION');
  const [methodology, setMethodology] = useState('');
  const [expectedAnnualTonnes, setExpectedAnnualTonnes] = useState('');
  const [polygonJson, setPolygonJson] = useState(DEFAULT_POLYGON);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    let geoPolygon: unknown;
    try {
      geoPolygon = JSON.parse(polygonJson);
    } catch {
      setError('Polygon JSON is invalid. Provide a valid GeoJSON object.');
      setBusy(false);
      return;
    }

    const payload: {
      projectName: string;
      projectType: ProjectType;
      methodology: string;
      expectedAnnualTonnes: number;
      geoPolygon: unknown;
    } = {
      projectName,
      projectType,
      methodology,
      expectedAnnualTonnes: parseFloat(expectedAnnualTonnes),
      geoPolygon,
    };

    try {
      await apiFetch('/projects', {
        method: 'POST',
        token: token ?? undefined,
        body: JSON.stringify(payload),
      });
      setProjectName('');
      setMethodology('');
      setExpectedAnnualTonnes('');
      setPolygonJson(DEFAULT_POLYGON);
      success('Project registered', 'Your project is now pending verification.');
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create project.');
      toastError('Registration failed', err?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.form
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      onSubmit={handleSubmit}
      className="glass relative overflow-hidden rounded-3xl p-6 shadow-float"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent-gradient-soft blur-3xl" />
      <motion.div variants={riseItem} className="relative mb-5">
        <h2 className="text-lg font-semibold text-content">Register a Project</h2>
        <p className="text-sm text-content-muted">
          Geo-polygon, methodology and expected tonnes are required.
        </p>
      </motion.div>

      <div className="relative space-y-4">
        <motion.div variants={riseItem}>
          <Input
            label="Project Name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Amazon Reforestation Phase 1"
            required
          />
        </motion.div>

        <motion.div variants={riseItem}>
          <Select
            label="Type"
            value={projectType}
            onChange={(e) => setProjectType(e.target.value as ProjectType)}
          >
            {PROJECT_TYPES.map((t) => (
              <option key={t.value} value={t.value} className="bg-ink-800">
                {t.label} — {t.desc}
              </option>
            ))}
          </Select>
        </motion.div>

        <motion.div variants={riseItem}>
          <Input
            label="Methodology"
            value={methodology}
            onChange={(e) => setMethodology(e.target.value)}
            placeholder="VM0033 — Afforestation, Reforestation and Revegetation"
            required
          />
        </motion.div>

        <motion.div variants={riseItem}>
          <Input
            label="Expected Annual Tonnes (CO₂)"
            type="number"
            step="0.0001"
            min="0"
            value={expectedAnnualTonnes}
            onChange={(e) => setExpectedAnnualTonnes(e.target.value)}
            placeholder="1250.5"
            required
          />
        </motion.div>

        <motion.div variants={riseItem}>
          <div className="relative">
            <Textarea
              label="Polygon (GeoJSON)"
              value={polygonJson}
              onChange={(e) => setPolygonJson(e.target.value)}
              rows={8}
              required
              className="font-mono text-xs"
            />
            <MapPin className="pointer-events-none absolute right-4 top-4 h-4 w-4 text-content-faint" />
          </div>
        </motion.div>

        {error && (
          <motion.p variants={riseItem} className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </motion.p>
        )}

        <motion.div variants={riseItem}>
          <Button type="submit" disabled={busy} className="w-full" size="lg">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              'Create Project'
            )}
          </Button>
        </motion.div>
      </div>
    </motion.form>
  );
}
