import importlib.util
import pathlib
import unittest
spec = importlib.util.spec_from_file_location('analyze', pathlib.Path(__file__).parents[1]/'analytics/analyze.py')
analyze = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analyze)

class Features(unittest.TestCase):
    def test_visibility_cv_rage_depth(self):
        events = [{'type':'snapshot','timestamp':0,'viewport':{'height':500,'documentHeight':2000}},
                  {'type':'visibilitychange','timestamp':1000,'state':'hidden'},
                  {'type':'visibilitychange','timestamp':4000,'state':'hidden'},
                  {'type':'visibilitychange','timestamp':5000,'state':'visible'}]
        events += [{'type':'click','timestamp':6000+i*200,'x':20,'y':20,'link':'https://example.com/cv.pdf?token=secret'} for i in range(4)]
        events += [{'type':'scroll','timestamp':7000,'root':True,'height':500,'documentHeight':2000,'y':1500},
                   {'type':'session-end','timestamp':8000}]
        summary=analyze.extract({'meta':{'url':'https://example.com/','startedAt':'2026-10-05T00:00:00Z'},'events':events})
        self.assertEqual(summary['observed_visible_seconds'],4)
        self.assertEqual(summary['max_scroll_depth_percent'],100)
        self.assertEqual(len(summary['rage_clicks']),1)
        self.assertEqual(summary['external_link_clicks'],[])
        self.assertNotIn('secret',str(summary))
        self.assertEqual(summary['key_link_clicks'][0]['absolute_time'],'2026-10-05T00:00:06+00:00')
    def test_open_hidden_and_unknown(self):
        s=analyze.extract([{'type':'snapshot','timestamp':0,'visibility':'hidden'}, {'type':'heartbeat','timestamp':5000}])
        self.assertEqual(s['observed_visible_seconds'],0)
        self.assertIsNone(s['max_scroll_depth_percent'])
        self.assertTrue(s['duration_is_observed_lower_bound'])
    def test_order(self):
        with self.assertRaises(ValueError):
            analyze.extract([{'timestamp':1},{'timestamp':0}])

if __name__=='__main__': unittest.main()
