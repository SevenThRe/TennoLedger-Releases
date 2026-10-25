import json
import tempfile
import unittest
from pathlib import Path
from auto import reward_scale_bounds, reward_scale_settings

class MenuScaleTests(unittest.TestCase):
    def test_reference_geometry_tracks_custom_and_legacy(self):
        self.assertEqual(reward_scale_bounds(1080, {'mode':'full','percent':100}), (.2, .4625))
        top, bottom = reward_scale_bounds(1440, {'mode':'legacy','percent':100})
        self.assertAlmostEqual(top, .315)
        self.assertAlmostEqual(bottom, .47669)
        self.assertEqual(reward_scale_bounds(1080, {'mode':'custom','percent':50}), (.35, .48125))
        for value in [0, 999, True, '100']:
            with self.assertRaises(ValueError):
                reward_scale_bounds(1080, {'mode':'custom','percent':value})

    def test_settings_are_reloaded_from_the_config_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'menu-scale.json'
            self.assertEqual(reward_scale_settings(path), {'mode':'full','percent':100})
            for percent in [85, 125]:
                path.write_text(json.dumps({'mode':'custom','percent':percent}), encoding='utf-8')
                self.assertEqual(reward_scale_settings(path)['percent'], percent)

if __name__ == '__main__':
    unittest.main()
