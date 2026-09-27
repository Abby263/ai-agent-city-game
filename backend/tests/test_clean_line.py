from app.cognition.client import _clean_line


def test_clean_line_drops_a_leaked_mood_label_but_keeps_real_words():
    assert _clean_line("Guarded, you caught me!", ("Guarded", "")) == "You caught me!"
    assert _clean_line("(Nervous) I guess so.", ("nervous", "")) == "I guess so."
    assert _clean_line("Happy to help!", ("Happy", "")) == "Happy to help!"
    assert _clean_line("Well, sure.", ("Guarded", "")) == "Well, sure."
    assert _clean_line("Hi \\u2014 there", ()) == "Hi — there"
